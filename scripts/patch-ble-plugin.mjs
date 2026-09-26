import fs from 'node:fs';
import path from 'node:path';

const pluginRoot = path.resolve('node_modules/@capacitor-community/bluetooth-le/android/src/main/java/com/capacitorjs/community/plugins/bluetoothle');
const scannerPath = path.join(pluginRoot, 'DeviceScanner.kt');
const blePath = path.join(pluginRoot, 'BluetoothLe.kt');

if (fs.existsSync(scannerPath)) {
  let content = fs.readFileSync(scannerPath, 'utf8');
  if (!content.includes('deviceNames')) {
    content = content.replace(
      'private var namePrefix: String = ""',
      `private var namePrefix: String = ""\n\n    private val deviceNames: HashMap<String, String> = HashMap()\n\n    fun getDeviceName(address: String): String? {\n        return deviceNames[address]\n    }`
    );
    content = content.replace(
      'if (namePrefix.isNotEmpty()) {\n                if (result.device.name == null || !result.device.name.startsWith(namePrefix)) {\n                    return\n                }\n            }\n            val isNew = deviceList.addDevice(result.device)\n            if (showDialog) {\n                if (isNew) {\n                    dialogHandler?.post {\n                        deviceStrings.add("[${result.device.address}] ${result.device.name ?: "Unknown"}")\n                        adapter?.notifyDataSetChanged()\n                    }\n                }\n            }',
      `val devName = result.scanRecord?.deviceName ?: result.device.name\n            if (namePrefix.isNotEmpty()) {\n                if (devName == null || !devName.startsWith(namePrefix, ignoreCase = true)) {\n                    return\n                }\n            }\n            if (devName != null) {\n                deviceNames[result.device.address] = devName\n            }\n            val isNew = deviceList.addDevice(result.device)\n            if (showDialog) {\n                if (isNew) {\n                    dialogHandler?.post {\n                        val displayName = devName ?: "未知设备"\n                        deviceStrings.add("[${result.device.address}] $displayName")\n                        adapter?.notifyDataSetChanged()\n                    }\n                } else if (devName != null) {\n                    dialogHandler?.post {\n                        val addr = result.device.address\n                        for (i in 0 until deviceStrings.size) {\n                            if (deviceStrings[i].startsWith("[$addr]") && (deviceStrings[i].endsWith("Unknown") || deviceStrings[i].endsWith("未知设备"))) {\n                                deviceStrings[i] = "[$addr] $devName"\n                                adapter?.notifyDataSetChanged()\n                                break\n                            }\n                        }\n                    }\n                }\n            }`
    );
    content = content.replace(
      'this.namePrefix = namePrefix\n\n        deviceStrings.clear()',
      'this.namePrefix = namePrefix\n\n        deviceNames.clear()\n        deviceStrings.clear()'
    );
    fs.writeFileSync(scannerPath, content, 'utf8');
    console.log('✅ Patched DeviceScanner.kt for real-time BLE name discovery');
  }
}

if (fs.existsSync(blePath)) {
  let content = fs.readFileSync(blePath, 'utf8');
  if (!content.includes('deviceScanner?.getDeviceName')) {
    content = content.replace(
      'if (device.name != null) {\n            bleDevice.put("name", device.name)\n        }',
      'val name = device.name ?: deviceScanner?.getDeviceName(device.address)\n        if (name != null) {\n            bleDevice.put("name", name)\n        }'
    );
    fs.writeFileSync(blePath, content, 'utf8');
    console.log('✅ Patched BluetoothLe.kt for resolved BLE name return');
  }
}
