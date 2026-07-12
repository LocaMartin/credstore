import Capacitor
import CoreBluetooth
import Foundation

@objc(CredStoreBluetoothPlugin)
public class CredStoreBluetoothPlugin: CAPPlugin, CAPBridgedPlugin, CBCentralManagerDelegate, CBPeripheralDelegate, CBPeripheralManagerDelegate {
    public let identifier = "CredStoreBluetoothPlugin"
    public let jsName = "CredStoreBluetooth"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "requestBluetoothPermissions", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "listBondedDevices", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startReceiver", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "sendPayload", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopReceiver", returnType: CAPPluginReturnPromise)
    ]

    private let serviceUUID = CBUUID(string: "1E89B6A8-0F62-4CE8-9478-83D94D4AA83A")
    private let transferUUID = CBUUID(string: "E3F63AC1-890A-4F95-8C95-2D37E66B0872")
    private let queue = DispatchQueue(label: "credstore.bluetooth")

    private var centralManager: CBCentralManager?
    private var peripheralManager: CBPeripheralManager?
    private var transferCharacteristic: CBMutableCharacteristic?
    private var discoveredPeripherals: [String: CBPeripheral] = [:]
    private var discoveredDevices: [[String: String]] = []
    private var scanCall: CAPPluginCall?
    private var receiveCall: CAPPluginCall?
    private var sendCall: CAPPluginCall?
    private var targetPeripheral: CBPeripheral?
    private var targetCharacteristic: CBCharacteristic?
    private var outgoingChunks: [Data] = []
    private var outgoingIndex = 0
    private var receivedChunks: [Int: String] = [:]
    private var expectedChunks = 0

    public override func load() {
        centralManager = CBCentralManager(delegate: self, queue: queue)
    }

    @objc func requestBluetoothPermissions(_ call: CAPPluginCall) {
        ensureCentralManager()
        call.resolve(["granted": true])
    }

    @objc func isAvailable(_ call: CAPPluginCall) {
        ensureCentralManager()
        let state = centralManager?.state ?? .unknown
        call.resolve([
            "available": state == .poweredOn,
            "code": stateCode(state),
            "message": state == .poweredOn ? "Bluetooth is available." : "Bluetooth is not powered on."
        ])
    }

    @objc func listBondedDevices(_ call: CAPPluginCall) {
        ensureCentralManager()
        guard centralManager?.state == .poweredOn else {
            call.reject("Bluetooth is not powered on")
            return
        }

        discoveredPeripherals.removeAll()
        discoveredDevices.removeAll()
        scanCall = call
        centralManager?.scanForPeripherals(withServices: [serviceUUID], options: [CBCentralManagerScanOptionAllowDuplicatesKey: false])

        queue.asyncAfter(deadline: .now() + 6.0) { [weak self] in
            guard let self = self, let scanCall = self.scanCall, scanCall === call else { return }
            self.centralManager?.stopScan()
            let devices = self.discoveredDevices
            self.scanCall = nil
            DispatchQueue.main.async {
                call.resolve(["devices": devices])
            }
        }
    }

    @objc func startReceiver(_ call: CAPPluginCall) {
        receiveCall = call
        receivedChunks.removeAll()
        expectedChunks = 0

        if peripheralManager == nil {
            peripheralManager = CBPeripheralManager(delegate: self, queue: queue)
            return
        }

        startAdvertisingReceiver()
    }

    @objc func sendPayload(_ call: CAPPluginCall) {
        guard let deviceId = call.getString("deviceId"),
              let payload = call.getString("payload") else {
            call.reject("deviceId and payload are required")
            return
        }
        guard let peripheral = discoveredPeripherals[deviceId] else {
            call.reject("Receiver not found. Load paired devices while the receiver is waiting.")
            return
        }

        sendCall = call
        targetPeripheral = peripheral
        targetCharacteristic = nil
        outgoingChunks = makeChunks(payload: payload)
        outgoingIndex = 0

        peripheral.delegate = self
        centralManager?.connect(peripheral, options: nil)
    }

    @objc func stopReceiver(_ call: CAPPluginCall) {
        peripheralManager?.stopAdvertising()
        receiveCall?.reject("Bluetooth receiver stopped")
        receiveCall = nil
        receivedChunks.removeAll()
        expectedChunks = 0
        call.resolve()
    }

    public func centralManagerDidUpdateState(_ central: CBCentralManager) {
        if central.state != .poweredOn {
            scanCall?.reject("Bluetooth is not powered on")
            scanCall = nil
            sendCall?.reject("Bluetooth is not powered on")
            sendCall = nil
        }
    }

    public func centralManager(_ central: CBCentralManager, didDiscover peripheral: CBPeripheral, advertisementData: [String: Any], rssi RSSI: NSNumber) {
        let id = peripheral.identifier.uuidString
        guard discoveredPeripherals[id] == nil else { return }
        discoveredPeripherals[id] = peripheral
        discoveredDevices.append([
            "id": id,
            "name": peripheral.name ?? "CredStore Receiver"
        ])
    }

    public func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral) {
        peripheral.discoverServices([serviceUUID])
    }

    public func centralManager(_ central: CBCentralManager, didFailToConnect peripheral: CBPeripheral, error: Error?) {
        sendCall?.reject(error?.localizedDescription ?? "Bluetooth connection failed")
        sendCall = nil
    }

    public func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
        if let error = error {
            sendCall?.reject(error.localizedDescription)
            sendCall = nil
            return
        }
        guard let service = peripheral.services?.first(where: { $0.uuid == serviceUUID }) else {
            sendCall?.reject("CredStore sync service was not found")
            sendCall = nil
            return
        }
        peripheral.discoverCharacteristics([transferUUID], for: service)
    }

    public func peripheral(_ peripheral: CBPeripheral, didDiscoverCharacteristicsFor service: CBService, error: Error?) {
        if let error = error {
            sendCall?.reject(error.localizedDescription)
            sendCall = nil
            return
        }
        guard let characteristic = service.characteristics?.first(where: { $0.uuid == transferUUID }) else {
            sendCall?.reject("CredStore sync characteristic was not found")
            sendCall = nil
            return
        }
        targetCharacteristic = characteristic
        writeNextChunk()
    }

    public func peripheral(_ peripheral: CBPeripheral, didWriteValueFor characteristic: CBCharacteristic, error: Error?) {
        if let error = error {
            sendCall?.reject(error.localizedDescription)
            sendCall = nil
            return
        }
        writeNextChunk()
    }

    public func peripheralManagerDidUpdateState(_ peripheral: CBPeripheralManager) {
        if peripheral.state == .poweredOn {
            startAdvertisingReceiver()
        } else if receiveCall != nil {
            receiveCall?.reject("Bluetooth is not powered on")
            receiveCall = nil
        }
    }

    public func peripheralManager(_ peripheral: CBPeripheralManager, didReceiveWrite requests: [CBATTRequest]) {
        for request in requests {
            guard request.characteristic.uuid == transferUUID,
                  let value = request.value,
                  let text = String(data: value, encoding: .utf8),
                  let data = text.data(using: .utf8),
                  let packet = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let index = packet["i"] as? Int,
                  let total = packet["t"] as? Int,
                  let chunk = packet["d"] as? String else {
                peripheral.respond(to: request, withResult: .invalidAttributeValueLength)
                continue
            }

            expectedChunks = total
            receivedChunks[index] = chunk
            peripheral.respond(to: request, withResult: .success)
        }

        if expectedChunks > 0 && receivedChunks.count == expectedChunks {
            let payload = (0..<expectedChunks).map { receivedChunks[$0] ?? "" }.joined()
            peripheralManager?.stopAdvertising()
            let call = receiveCall
            receiveCall = nil
            receivedChunks.removeAll()
            expectedChunks = 0
            DispatchQueue.main.async {
                call?.resolve(["payload": payload])
            }
        }
    }

    private func ensureCentralManager() {
        if centralManager == nil {
            centralManager = CBCentralManager(delegate: self, queue: queue)
        }
    }

    private func startAdvertisingReceiver() {
        guard let peripheralManager = peripheralManager,
              peripheralManager.state == .poweredOn,
              receiveCall != nil else {
            return
        }

        peripheralManager.removeAllServices()
        let characteristic = CBMutableCharacteristic(
            type: transferUUID,
            properties: [.write],
            value: nil,
            permissions: [.writeable]
        )
        transferCharacteristic = characteristic
        let service = CBMutableService(type: serviceUUID, primary: true)
        service.characteristics = [characteristic]
        peripheralManager.add(service)
        peripheralManager.startAdvertising([
            CBAdvertisementDataServiceUUIDsKey: [serviceUUID],
            CBAdvertisementDataLocalNameKey: "CredStore Receiver"
        ])
    }

    private func writeNextChunk() {
        guard let peripheral = targetPeripheral,
              let characteristic = targetCharacteristic,
              let call = sendCall else {
            return
        }

        if outgoingIndex >= outgoingChunks.count {
            centralManager?.cancelPeripheralConnection(peripheral)
            sendCall = nil
            DispatchQueue.main.async {
                call.resolve()
            }
            return
        }

        let data = outgoingChunks[outgoingIndex]
        outgoingIndex += 1
        peripheral.writeValue(data, for: characteristic, type: .withResponse)
    }

    private func makeChunks(payload: String) -> [Data] {
        let size = 360
        let chars = Array(payload)
        let total = Int(ceil(Double(chars.count) / Double(size)))

        return (0..<max(total, 1)).compactMap { index in
            let start = index * size
            let end = min(start + size, chars.count)
            let chunk = start < end ? String(chars[start..<end]) : ""
            let packet: [String: Any] = ["i": index, "t": max(total, 1), "d": chunk]
            let data = try? JSONSerialization.data(withJSONObject: packet)
            return data
        }
    }

    private func stateCode(_ state: CBManagerState) -> String {
        switch state {
        case .poweredOn:
            return "AVAILABLE"
        case .poweredOff:
            return "DISABLED"
        case .unauthorized:
            return "UNAUTHORIZED"
        case .unsupported:
            return "NO_HARDWARE"
        case .resetting:
            return "RESETTING"
        case .unknown:
            fallthrough
        @unknown default:
            return "UNKNOWN"
        }
    }
}
