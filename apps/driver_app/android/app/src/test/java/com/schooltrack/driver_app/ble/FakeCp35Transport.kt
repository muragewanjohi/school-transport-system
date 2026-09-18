package com.schooltrack.driver_app.ble

/**
 * In-memory transport for JVM unit tests.
 */
class FakeCp35Transport(
    private val expectedPassword: String = "DX1234",
    private val failPasswordWrite: Boolean = false,
    private val failCommands: Boolean = false,
) : Cp35Transport {
    private var connectedFlag = false
    var connectedMac: String? = null
        private set
    val passwordWrites = mutableListOf<ByteArray>()
    val commands = mutableListOf<ByteArray>()
    var disconnectCount = 0
        private set

    override val isConnected: Boolean get() = connectedFlag

    override fun connect(mac: String): Result<Unit> {
        connectedMac = mac.uppercase()
        connectedFlag = true
        return Result.success(Unit)
    }

    override fun writePassword(passwordUtf8: ByteArray): Result<Unit> {
        if (!connectedFlag) return Result.failure(Cp35ProvisionError.NotConnected())
        passwordWrites.add(passwordUtf8.copyOf())
        if (failPasswordWrite) return Result.failure(Cp35ProvisionError.AuthFailed())
        val got = String(passwordUtf8, Charsets.UTF_8)
        return if (got == expectedPassword) {
            Result.success(Unit)
        } else {
            Result.failure(Cp35ProvisionError.AuthFailed())
        }
    }

    override fun writeCommand(frame: ByteArray): Result<Unit> {
        if (!connectedFlag) return Result.failure(Cp35ProvisionError.NotConnected())
        if (!Cp35FrameCodec.check(frame)) {
            return Result.failure(Cp35ProvisionError.GattError("bad_frame"))
        }
        commands.add(frame.copyOf())
        return if (failCommands) {
            Result.failure(Cp35ProvisionError.GattError("write_status"))
        } else {
            Result.success(Unit)
        }
    }

    override fun disconnect() {
        connectedFlag = false
        disconnectCount++
    }
}
