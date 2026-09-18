package com.schooltrack.driver_app

import android.bluetooth.BluetoothManager
import android.content.Context
import android.os.Handler
import android.os.Looper
import com.schooltrack.driver_app.ble.AndroidCp35Transport
import com.schooltrack.driver_app.ble.Cp35GattClient
import com.schooltrack.driver_app.ble.Cp35ProvisionError
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel
import java.util.concurrent.Executors

/**
 * MethodChannel bridge for CP35 tag provisioning via first-party GATT client.
 *
 * Channel: [CHANNEL]. Never logs tag passwords.
 */
class DxBeaconPlugin : MethodChannel.MethodCallHandler {
    companion object {
        const val CHANNEL = "com.schooltrack.driver_app/dx_beacon"
        const val FACTORY_PASSWORD = "DX1234"
    }

    private var appContext: Context? = null
    private val mainHandler = Handler(Looper.getMainLooper())
    private val executor = Executors.newSingleThreadExecutor()
    private var client: Cp35GattClient? = null

    /** Call from [MainActivity.configureFlutterEngine] before handling methods. */
    fun attach(context: Context) {
        appContext = context.applicationContext
    }

    override fun onMethodCall(call: MethodCall, result: MethodChannel.Result) {
        when (call.method) {
            "isSdkAvailable" -> result.success(isProvisionRadioAvailable())
            "scanNearbyBeacons" -> result.success(emptyList<Map<String, Any>>())
            "connect" -> runAsync(result) {
                ensureClient().connect(call.argument<String>("mac") ?: "")
            }
            "unlock" -> runAsync(result) {
                ensureClient().unlock(call.argument<String>("password") ?: "")
            }
            "writeIBeacon" -> runAsync(result) {
                val uuid = call.argument<String>("uuid")
                val major = call.argument<Number>("major")?.toInt()
                val minor = call.argument<Number>("minor")?.toInt()
                if (uuid.isNullOrBlank() || major == null || minor == null) {
                    Result.failure(Cp35ProvisionError.BadArgs("uuid, major, minor required"))
                } else {
                    ensureClient().writeIBeacon(
                        uuid = uuid,
                        major = major,
                        minor = minor,
                        txDbm = call.argument<Number>("txDbm")?.toDouble() ?: -19.5,
                        intervalMs = call.argument<Number>("intervalMs")?.toInt() ?: 400,
                    )
                }
            }
            "enableTlm" -> runAsync(result) {
                ensureClient().enableTlm(
                    intervalMs = call.argument<Number>("intervalMs")?.toInt() ?: 800,
                    txDbm = call.argument<Number>("txDbm")?.toDouble() ?: -19.5,
                )
            }
            "setDevicePassword" -> runAsync(result) {
                ensureClient().setDevicePassword(call.argument<String>("newPassword") ?: "")
            }
            "restart" -> runAsync(result) {
                ensureClient().restart(call.argument<String>("password") ?: "")
            }
            "disconnect" -> runAsync(result) {
                client?.disconnect()
                Result.success(Unit)
            }
            else -> result.notImplemented()
        }
    }

    private fun isProvisionRadioAvailable(): Boolean {
        val ctx = appContext ?: return false
        val adapter =
            (ctx.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager)?.adapter
        return adapter != null
    }

    private fun ensureClient(): Cp35GattClient {
        val existing = client
        if (existing != null) return existing
        val ctx = appContext ?: throw Cp35ProvisionError.GattError("no_context")
        val created = Cp35GattClient(AndroidCp35Transport(ctx), commandPauseMs = 80L)
        client = created
        return created
    }

    private fun runAsync(result: MethodChannel.Result, block: () -> Result<Unit>) {
        executor.execute {
            val outcome = try {
                block()
            } catch (e: Cp35ProvisionError) {
                Result.failure(e)
            } catch (e: Exception) {
                Result.failure(Cp35ProvisionError.GattError(e.javaClass.simpleName))
            }
            mainHandler.post {
                outcome.fold(
                    onSuccess = { result.success(true) },
                    onFailure = { err ->
                        when (err) {
                            is Cp35ProvisionError.AuthFailed -> result.success(false)
                            is Cp35ProvisionError.NotConnected ->
                                result.error("not_connected", err.message, null)
                            is Cp35ProvisionError.BadArgs ->
                                result.error("bad_args", err.message, null)
                            is Cp35ProvisionError.Timeout ->
                                result.error("timeout", err.message, null)
                            is Cp35ProvisionError.GattError ->
                                result.error("gatt_error", err.message, null)
                            else -> result.error("gatt_error", err.message, null)
                        }
                    },
                )
            }
        }
    }
}
