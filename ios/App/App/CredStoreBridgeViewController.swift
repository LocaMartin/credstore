import Capacitor
import Darwin
import UIKit

class CredStoreBridgeViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        super.capacitorDidLoad()
        if !verifyRuntimeEnvironment() {
            exit(1)
        }
        bridge?.registerPluginInstance(CredStoreBluetoothPlugin())
    }

    private func verifyRuntimeEnvironment() -> Bool {
        #if DEBUG
        return true
        #else
        if isDebuggerAttached() {
            return false
        }

        let blockedPaths = [
            "/Applications/Cydia.app",
            "/Applications/Sileo.app",
            "/Library/MobileSubstrate/MobileSubstrate.dylib",
            "/bin/bash",
            "/usr/sbin/sshd",
            "/etc/apt",
            "/private/var/lib/apt"
        ]

        return !blockedPaths.contains { FileManager.default.fileExists(atPath: $0) }
        #endif
    }

    private func isDebuggerAttached() -> Bool {
        var info = kinfo_proc()
        var mib = [CTL_KERN, KERN_PROC, KERN_PROC_PID, getpid()]
        var size = MemoryLayout<kinfo_proc>.stride
        let result = sysctl(&mib, u_int(mib.count), &info, &size, nil, 0)
        if result != 0 {
            return false
        }
        return (info.kp_proc.p_flag & P_TRACED) != 0
    }
}
