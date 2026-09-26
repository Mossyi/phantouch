import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

async function bundled(path) {
  const result = await build({
    entryPoints: [path],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    logLevel: 'silent',
  });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}#${Math.random()}`);
}

test('Coyote V2 protocol: strength scaling, packing, unpacking, and waveform bit-packing', async () => {
  const { CoyoteV2Protocol } = await bundled('src/core/protocol/coyoteProtocol.ts');

  // 1. Strength scaling
  assert.equal(CoyoteV2Protocol.scaleStrengthToRaw(0), 0);
  assert.equal(CoyoteV2Protocol.scaleStrengthToRaw(1), 7);
  assert.equal(CoyoteV2Protocol.scaleStrengthToRaw(50), 350);
  assert.equal(CoyoteV2Protocol.scaleStrengthToRaw(200), 1400);
  assert.equal(CoyoteV2Protocol.scaleStrengthToRaw(300), 1400); // clamped
  assert.equal(CoyoteV2Protocol.scaleStrengthToRaw(-5), 0); // clamped

  assert.equal(CoyoteV2Protocol.scaleRawToStrength(0), 0);
  assert.equal(CoyoteV2Protocol.scaleRawToStrength(7), 1);
  assert.equal(CoyoteV2Protocol.scaleRawToStrength(1400), 200);

  // 2. Strength packet packing & unpacking (24-bit big endian)
  const packet1 = CoyoteV2Protocol.buildStrengthPacket(100, 50);
  assert.equal(packet1.length, 3);
  const parsed1 = CoyoteV2Protocol.parseStrengthPacket(packet1);
  assert.equal(parsed1.strengthA, 100);
  assert.equal(parsed1.strengthB, 50);

  // Edge cases: min and max
  const packetZero = CoyoteV2Protocol.buildStrengthPacket(0, 0);
  assert.deepEqual(Array.from(packetZero), [0, 0, 0]);
  const parsedZero = CoyoteV2Protocol.parseStrengthPacket(packetZero);
  assert.equal(parsedZero.strengthA, 0);
  assert.equal(parsedZero.strengthB, 0);

  const packetMax = CoyoteV2Protocol.buildStrengthPacket(200, 200);
  const parsedMax = CoyoteV2Protocol.parseStrengthPacket(packetMax);
  assert.equal(parsedMax.strengthA, 200);
  assert.equal(parsedMax.strengthB, 200);

  // 3. Frequency mapping to X and Y
  const f10 = CoyoteV2Protocol.calcXYFromFrequency(10);
  assert.equal(f10.x, 2);
  assert.equal(f10.y, 8);

  const f1000 = CoyoteV2Protocol.calcXYFromFrequency(1000);
  assert.equal(f1000.x, 15);
  assert.equal(f1000.y, 985);

  // Clamping
  const fLow = CoyoteV2Protocol.calcXYFromFrequency(2);
  assert.equal(fLow.x, 2); // clamped to 10Hz
  assert.equal(fLow.y, 8);
  const fHigh = CoyoteV2Protocol.calcXYFromFrequency(2000);
  assert.equal(fHigh.x, 15); // clamped to 1000Hz

  // 4. Waveform packet bit-packing (24-bit little endian)
  // Official DG-LAB example: x=1, y=1, z=0
  // Value = (0 << 15) | (1 << 5) | 1 = 32 | 1 = 33 (0x000021)
  // Little-endian bytes: [0x21, 0x00, 0x00]
  const wavePkt = CoyoteV2Protocol.buildWavePacket(1, 1, 0);
  assert.equal(wavePkt.length, 3);
  assert.equal(wavePkt[0], 0x21);
  assert.equal(wavePkt[1], 0x00);
  assert.equal(wavePkt[2], 0x00);

  // Preset wave patterns
  const breathe = CoyoteV2Protocol.getPresetWavePattern('breathe');
  assert.ok(Array.isArray(breathe));
  assert.ok(breathe.length > 0);
  const firstStep = breathe[0];
  assert.ok(firstStep[0] >= 1 && firstStep[0] <= 31);
  assert.ok(firstStep[1] >= 1 && firstStep[1] <= 1023);
  assert.ok(firstStep[2] >= 0 && firstStep[2] <= 31);
});

test('Coyote V3 protocol: frequency curve, B0 packet generation, and BF/B1 notifications', async () => {
  const { CoyoteV3Protocol } = await bundled('src/core/protocol/coyoteProtocol.ts');

  // 1. Frequency compression curve (10-1000 -> 10-240)
  assert.equal(CoyoteV3Protocol.convertFrequencyToV3(10), 10);
  assert.equal(CoyoteV3Protocol.convertFrequencyToV3(50), 50);
  assert.equal(CoyoteV3Protocol.convertFrequencyToV3(100), 100);
  assert.equal(CoyoteV3Protocol.convertFrequencyToV3(200), 120);
  assert.equal(CoyoteV3Protocol.convertFrequencyToV3(600), 200);
  assert.equal(CoyoteV3Protocol.convertFrequencyToV3(1000), 240);

  // 2. B0 packet structure (20 bytes)
  const b0 = CoyoteV3Protocol.buildB0Packet({
    seq: 3,
    modeA: 3, // absolute set
    modeB: 3,
    strengthA: 85,
    strengthB: 120,
    waveFreqA: [50, 60, 70, 80],
    waveIntensityA: [100, 90, 80, 70],
    waveFreqB: [30, 40, 50, 60],
    waveIntensityB: [40, 50, 60, 70],
  });

  assert.equal(b0.length, 20);
  assert.equal(b0[0], 0xB0); // Header B0
  // Byte 1: (seq & 0x0F) << 4 | (modeA & 0x03) << 2 | (modeB & 0x03)
  // (3 << 4) | (3 << 2) | 3 = 0x30 | 0x0C | 0x03 = 0x3F
  assert.equal(b0[1], 0x3F);
  assert.equal(b0[2], 85); // strengthA
  assert.equal(b0[3], 120); // strengthB

  // Frequencies mapped
  assert.equal(b0[4], 50);
  assert.equal(b0[5], 60);
  assert.equal(b0[8], 100); // intensity A0

  // 3. Stop packet
  const stopPkt = CoyoteV3Protocol.buildStopPacket(5);
  assert.equal(stopPkt.length, 20);
  assert.equal(stopPkt[0], 0xB0);
  assert.equal(stopPkt[2], 0); // strengthA = 0
  assert.equal(stopPkt[3], 0); // strengthB = 0

  // 4. BF packet (7 bytes)
  const bf = CoyoteV3Protocol.buildBFPacket(150, 160, 0, 0);
  assert.equal(bf.length, 7);
  assert.equal(bf[0], 0xBF);
  assert.equal(bf[1], 150);
  assert.equal(bf[2], 160);

  // 5. B1 notify packet parsing (0xB1 + seq + strengthA + strengthB)
  const notifyRaw = new Uint8Array([
    0xB1, // Header
    0x02, // Seq
    88,   // Strength A
    125,  // Strength B
  ]);
  const parsedNotify = CoyoteV3Protocol.parseNotifyPacket(notifyRaw);
  assert.ok(parsedNotify !== null);
  assert.equal(parsedNotify.type, 'strength');
  assert.equal(parsedNotify.strengthA, 88);
  assert.equal(parsedNotify.strengthB, 125);

  // 6. Battery notify packet parsing (1 byte on 0x1500)
  const batteryRaw = new Uint8Array([92]);
  const parsedBattery = CoyoteV3Protocol.parseNotifyPacket(batteryRaw);
  assert.equal(parsedBattery.type, 'battery');
  assert.equal(parsedBattery.battery, 92);
});

test('DG-LAB Socket protocol: QR link format and message serialization/parsing', async () => {
  const { DGLabSocketProtocol } = await bundled('src/core/protocol/coyoteProtocol.ts');

  // 1. QR code URL format
  const qr = DGLabSocketProtocol.buildBindQrUrl('ws://192.168.1.100:5678', 'client-abc-123');
  assert.equal(qr, 'https://www.dungeon-lab.com/app-download.php#DGLAB-SOCKET#ws://192.168.1.100:5678/client-abc-123');

  // 2. Set strength message
  const strAJson = DGLabSocketProtocol.buildSetStrengthMessage('client-1', 'app-2', 1, 66);
  const strA = JSON.parse(strAJson);
  assert.equal(strA.type, 'msg');
  assert.equal(strA.clientId, 'client-1');
  assert.equal(strA.targetId, 'app-2');
  assert.equal(strA.message, 'strength-1+2+66');

  const strBJson = DGLabSocketProtocol.buildSetStrengthMessage('client-1', 'app-2', 2, 99);
  const strB = JSON.parse(strBJson);
  assert.equal(strB.message, 'strength-2+2+99');

  // Adjust strength message
  const adjJson = DGLabSocketProtocol.buildAdjustStrengthMessage('client-1', 'app-2', 1, 1, 5);
  const adj = JSON.parse(adjJson);
  assert.equal(adj.message, 'strength-1+1+5');

  // 3. Clear wave message
  const clrJson = DGLabSocketProtocol.buildClearWaveMessage('client-1', 'app-2', 1);
  const clr = JSON.parse(clrJson);
  assert.equal(clr.message, 'clear-1');

  // 4. Message parsing
  const parsedBind = DGLabSocketProtocol.parseMessage(JSON.stringify({
    type: 'bind',
    clientId: 'app-phone-001',
    targetId: 'client-1',
    message: 'targetId'
  }));
  assert.ok(parsedBind !== null);
  assert.equal(parsedBind.type, 'bind');
  assert.equal(parsedBind.clientId, 'app-phone-001');

  // 4. Message parsing: DG-Lab App pushes current strength and limits: strength-A+B+limitA+limitB
  const parsedMsg = DGLabSocketProtocol.parseMessage(JSON.stringify({
    type: 'msg',
    clientId: 'app-phone-001',
    targetId: 'client-1',
    message: 'strength-45+60+100+120'
  }));
  assert.ok(parsedMsg !== null);
  assert.equal(parsedMsg.type, 'strength');
  assert.equal(parsedMsg.strengthA, 45);
  assert.equal(parsedMsg.strengthB, 60);
  assert.equal(parsedMsg.limitA, 100);
  assert.equal(parsedMsg.limitB, 120);

  // App feedback button
  const parsedFeedback = DGLabSocketProtocol.parseMessage(JSON.stringify({
    type: 'msg',
    clientId: 'app-phone-001',
    targetId: 'client-1',
    message: 'feedback-5'
  }));
  assert.ok(parsedFeedback !== null);
  assert.equal(parsedFeedback.type, 'feedback');
  assert.equal(parsedFeedback.feedbackIndex, 5);
});

test('CoyoteWaveformConverter: all 24+ EMS waveforms convert dynamically to V2, V3, and DGLab socket pulses', async () => {
  const { CoyoteWaveformConverter, CoyoteV2Protocol, DGLabSocketProtocol } = await bundled('src/core/protocol/coyoteProtocol.ts');
  const { EMSWaveEngine } = await bundled('src/core/protocol/waveEngine.ts');

  const allWaves = EMSWaveEngine.getAllWaves();
  assert.ok(allWaves.length >= 24, `Expected at least 24 waves, found ${allWaves.length}`);

  // Test Little-Endian byte-level structure
  const rawPkt = CoyoteV2Protocol.buildStrengthPacket(100, 50);
  assert.equal(rawPkt[0], 0x5E);
  assert.equal(rawPkt[1], 0xE1);
  assert.equal(rawPkt[2], 0x15);

  // Test every wave across V2, V3, and DG-LAB Pulse formats
  for (const wave of allWaves) {
    // 1. V2 conversion test
    for (let step = 0; step < 10; step++) {
      const [x, y, z] = CoyoteWaveformConverter.getV2Step(wave.id, step);
      assert.ok(Number.isInteger(x) && x >= 1 && x <= 31, `Invalid x: ${x} for wave ${wave.id}`);
      assert.ok(Number.isInteger(y) && y >= 0 && y <= 1023, `Invalid y: ${y} for wave ${wave.id}`);
      assert.ok(Number.isInteger(z) && z >= 0 && z <= 31, `Invalid z: ${z} for wave ${wave.id}`);

      // Verify wave packet builds cleanly
      const pkt = CoyoteV2Protocol.buildWavePacket(x, y, z);
      assert.equal(pkt.length, 3);
    }

    // 2. V3 conversion test
    for (let step = 0; step < 5; step++) {
      const slice = CoyoteWaveformConverter.getV3Slice(wave.id, step);
      assert.equal(slice.freq.length, 4);
      assert.equal(slice.intensity.length, 4);
      for (let i = 0; i < 4; i++) {
        assert.ok(slice.freq[i] >= 10 && slice.freq[i] <= 240, `Invalid V3 freq: ${slice.freq[i]} for wave ${wave.id}`);
        assert.ok(slice.intensity[i] >= 0 && slice.intensity[i] <= 100, `Invalid V3 intensity: ${slice.intensity[i]} for wave ${wave.id}`);
      }
    }

    // 3. DG-LAB Socket Pulse conversion test
    const pulses = CoyoteWaveformConverter.convertToDGLabPulses(wave.id, 2); // 2 seconds = 20 frames
    assert.equal(pulses.length, 20);
    for (const frame of pulses) {
      assert.equal(frame.length, 16, `Frame ${frame} length should be 16 for wave ${wave.id}`);
      assert.match(frame, /^[0-9A-F]{16}$/, `Frame ${frame} should be valid 16-hex characters`);
    }

    // 4. Pulse message structure
    const pulseMsg = DGLabSocketProtocol.buildPulseMessage('c1', 't1', 'A', pulses.slice(0, 5), 2);
    const parsedPulseMsg = JSON.parse(pulseMsg);
    assert.equal(parsedPulseMsg.type, 'clientMsg');
    assert.equal(parsedPulseMsg.clientId, 'c1');
    assert.equal(parsedPulseMsg.targetId, 't1');
    assert.equal(parsedPulseMsg.channel, 'A');
    assert.equal(parsedPulseMsg.time, 2);
    assert.ok(parsedPulseMsg.message.startsWith('A:['));
  }
});

test('Coyote device detection: identification from service UUIDs and device names', async () => {
  const { COYOTE_V2_UUIDS, COYOTE_V3_UUIDS, CoyoteV3Protocol } = await bundled('src/core/protocol/coyoteProtocol.ts');
  
  // V3 service UUID contains 180c
  assert.ok(COYOTE_V3_UUIDS.SERVICE.toLowerCase().includes('180c'));
  assert.ok(COYOTE_V3_UUIDS.WRITE_CHAR.toLowerCase().includes('150a'));
  assert.ok(COYOTE_V3_UUIDS.NOTIFY_CHAR.toLowerCase().includes('150b'));

  // V2 service UUID contains 180b and 955a
  assert.ok(COYOTE_V2_UUIDS.SERVICE.toLowerCase().includes('180b'));
  assert.ok(COYOTE_V2_UUIDS.POWER_CHAR.toLowerCase().includes('1504'));

  // BF packet on connect: 7 bytes
  const bf = CoyoteV3Protocol.buildBFPacket(200, 200, 128, 128, 128, 128);
  assert.equal(bf.length, 7);
  assert.equal(bf[0], 0xbf);
  assert.equal(bf[1], 200);
  assert.equal(bf[2], 200);
  assert.equal(bf[3], 128);
  assert.equal(bf[4], 128);
  assert.equal(bf[5], 128);
  assert.equal(bf[6], 128);
});

