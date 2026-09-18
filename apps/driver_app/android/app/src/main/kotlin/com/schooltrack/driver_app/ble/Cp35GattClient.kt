package com.schooltrack.driver_app.ble

/**
 * Orchestrates CP35 provision over [Cp35Transport].
 * Auth must complete quickly (vendor disconnects if password not written within ~30s).
 */
class Cp35GattClient(
    private val transport: Cp35Transport,
    private val commandPauseMs: Long = 80L,
) {
    val isConnected: Boolean get() = transport.isConnected

    fun connect(mac: String): Result<Unit> {
        if (mac.isBlank()) return Result.failure(Cp35ProvisionError.BadArgs("mac required"))
        return transport.connect(mac.trim().uppercase())
    }

    fun unlock(password: String): Result<Unit> {
        if (!transport.isConnected) return Result.failure(Cp35ProvisionError.NotConnected())
        if (password.length != 6) return Result.failure(Cp35ProvisionError.AuthFailed())
        return try {
            val bytes = Cp35Commands.passwordBytes(password)
            transport.writePassword(bytes).fold(
                onSuccess = { Result.success(Unit) },
                onFailure = { Result.failure(Cp35ProvisionError.AuthFailed()) },
            )
        } catch (_: IllegalArgumentException) {
            Result.failure(Cp35ProvisionError.AuthFailed())
        }
    }

    fun writeIBeacon(
        uuid: String,
        major: Int,
        minor: Int,
        txDbm: Double = -19.5,
        intervalMs: Int = 400,
    ): Result<Unit> {
        if (!transport.isConnected) return Result.failure(Cp35ProvisionError.NotConnected())
        return runCommands(
            Cp35Commands.writeIBeaconSequence(uuid, major, minor, txDbm, intervalMs),
        )
    }

    fun enableTlm(intervalMs: Int = 800, txDbm: Double = -19.5): Result<Unit> {
        if (!transport.isConnected) return Result.failure(Cp35ProvisionError.NotConnected())
        return runCommands(Cp35Commands.enableTlmSequence(intervalMs, txDbm))
    }

    fun setDevicePassword(newPassword: String): Result<Unit> {
        if (!transport.isConnected) return Result.failure(Cp35ProvisionError.NotConnected())
        if (newPassword.length != 6) {
            return Result.failure(Cp35ProvisionError.BadArgs("newPassword must be 6 characters"))
        }
        return runCommands(listOf(Cp35Commands.setDevicePassword(newPassword)))
    }

    fun restart(password: String): Result<Unit> {
        if (!transport.isConnected) return Result.failure(Cp35ProvisionError.NotConnected())
        if (password.length != 6) return Result.failure(Cp35ProvisionError.AuthFailed())
        val save = runCommands(listOf(Cp35Commands.saveConfig()))
        if (save.isFailure) return save
        val reboot = runCommands(listOf(Cp35Commands.restart(password)))
        transport.disconnect()
        return reboot
    }

    fun disconnect() {
        transport.disconnect()
    }

    private fun runCommands(frames: List<ByteArray>): Result<Unit> {
        for (frame in frames) {
            val written = transport.writeCommand(frame)
            if (written.isFailure) {
                return Result.failure(
                    written.exceptionOrNull() ?: Cp35ProvisionError.GattError("write failed"),
                )
            }
            if (commandPauseMs > 0) {
                try {
                    Thread.sleep(commandPauseMs)
                } catch (_: InterruptedException) {
                    Thread.currentThread().interrupt()
                    return Result.failure(Cp35ProvisionError.Timeout("command"))
                }
            }
        }
        return Result.success(Unit)
    }
}
