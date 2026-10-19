import fs from 'node:fs';
import path from 'node:path';

const pluginRoot = path.resolve('node_modules/@capacitor-community/bluetooth-le/android/src/main/java/com/capacitorjs/community/plugins/bluetoothle');
const scannerPath = path.join(pluginRoot, 'DeviceScanner.kt');
const blePath = path.join(pluginRoot, 'BluetoothLe.kt');

// The plugin ships with CRLF line endings; patch on LF and restore the original style on write.
function readSource(file) {
  const raw = fs.readFileSync(file, 'utf8');
  return { content: raw.replace(/\r\n/g, '\n'), crlf: raw.includes('\r\n') };
}

function writeSource(file, content, crlf) {
  fs.writeFileSync(file, crlf ? content.replace(/\n/g, '\r\n') : content, 'utf8');
}

function patch(content, search, replacement, file) {
  if (!content.includes(search)) {
    console.warn(`⚠️  ${path.basename(file)}: snippet not found, plugin source may have changed:\n${search.split('\n')[0]}`);
    return content;
  }
  return content.replace(search, () => replacement);
}

if (fs.existsSync(scannerPath)) {
  let { content, crlf } = readSource(scannerPath);
  if (!content.includes('deviceNames')) {
    content = patch(
      content,
      'private var namePrefix: String = ""',
      `private var namePrefix: String = ""\n\n    private val deviceNames: HashMap<String, String> = HashMap()\n\n    fun getDeviceName(address: String): String? {\n        return deviceNames[address]\n    }`,
      scannerPath
    );
    content = patch(
      content,
      'if (namePrefix.isNotEmpty()) {\n                if (result.device.name == null || !result.device.name.startsWith(namePrefix)) {\n                    return\n                }\n            }\n            val isNew = deviceList.addDevice(result.device)\n            if (showDialog) {\n                if (isNew) {\n                    dialogHandler?.post {\n                        deviceStrings.add("[${result.device.address}] ${result.device.name ?: "Unknown"}")\n                        adapter?.notifyDataSetChanged()\n                    }\n                }\n            }',
      `val devName = result.scanRecord?.deviceName ?: result.device.name\n            if (namePrefix.isNotEmpty()) {\n                if (devName == null || !devName.startsWith(namePrefix, ignoreCase = true)) {\n                    return\n                }\n            }\n            if (devName != null) {\n                deviceNames[result.device.address] = devName\n            }\n            val isNew = deviceList.addDevice(result.device)\n            if (showDialog) {\n                if (isNew) {\n                    dialogHandler?.post {\n                        val displayName = devName ?: "未知设备"\n                        deviceStrings.add("[\${result.device.address}] $displayName")\n                        adapter?.notifyDataSetChanged()\n                    }\n                } else if (devName != null) {\n                    dialogHandler?.post {\n                        val addr = result.device.address\n                        for (i in 0 until deviceStrings.size) {\n                            if (deviceStrings[i].startsWith("[$addr]") && (deviceStrings[i].endsWith("Unknown") || deviceStrings[i].endsWith("未知设备"))) {\n                                deviceStrings[i] = "[$addr] $devName"\n                                adapter?.notifyDataSetChanged()\n                                break\n                            }\n                        }\n                    }\n                }\n            }`,
      scannerPath
    );
    content = patch(
      content,
      'this.namePrefix = namePrefix\n\n        deviceStrings.clear()',
      'this.namePrefix = namePrefix\n\n        deviceNames.clear()\n        deviceStrings.clear()',
      scannerPath
    );
    writeSource(scannerPath, content, crlf);
    console.log('✅ Patched DeviceScanner.kt for real-time BLE name discovery');
  }
}

if (fs.existsSync(blePath)) {
  let { content, crlf } = readSource(blePath);
  if (!content.includes('deviceScanner?.getDeviceName')) {
    content = patch(
      content,
      'if (device.name != null) {\n            bleDevice.put("name", device.name)\n        }',
      'val name = device.name ?: deviceScanner?.getDeviceName(device.address)\n        if (name != null) {\n            bleDevice.put("name", name)\n        }',
      blePath
    );
    writeSource(blePath, content, crlf);
    console.log('✅ Patched BluetoothLe.kt for resolved BLE name return');
  }
}
