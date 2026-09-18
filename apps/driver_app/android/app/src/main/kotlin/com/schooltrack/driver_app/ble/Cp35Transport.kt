package com.schooltrack.driver_app.ble

/**
 * Minimal BLE transport for CP35 provision. Real impl uses Android BluetoothGatt;
 * tests use [FakeCp35Transport].
 */
interface Cp35Transport {
    val isConnected: Boolean

    /** Connect and ready notify/write characteristics. */
    fun connect(mac: String): Result<Unit>

    /** Write UTF-8 password to FFE3. Must not log [passwordUtf8] as text. */
    fun writePassword(passwordUtf8: ByteArray): Result<Unit>

    /** Write a framed command to FFE2. */
    fun writeCommand(frame: ByteArray): Result<Unit>

    fun disconnect()
}

sealed class Cp35ProvisionError(message: String) : Exception(message) {
    class NotConnected : Cp35ProvisionError("not_connected")
    class AuthFailed : Cp35ProvisionError("auth_failed")
    class Timeout(op: String) : Cp35ProvisionError("timeout:$op")
    class GattError(detail: String) : Cp35ProvisionError("gatt_error:$detail")
    class BadArgs(detail: String) : Cp35ProvisionError("bad_args:$detail")
}
