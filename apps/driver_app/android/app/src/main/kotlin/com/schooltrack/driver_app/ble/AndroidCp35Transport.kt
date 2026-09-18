package com.schooltrack.driver_app.ble

import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothGatt
import android.bluetooth.BluetoothGattCallback
import android.bluetooth.BluetoothGattCharacteristic
import android.bluetooth.BluetoothGattDescriptor
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothProfile
import android.content.Context
import android.os.Build
import android.util.Log
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicReference

/**
 * Android BluetoothGatt transport for CP35 (FFE0 / FFE1–FFE3).
 * Never logs password payloads.
 */
@SuppressLint("MissingPermission")
class AndroidCp35Transport(
    private val context: Context,
    private val connectTimeoutMs: Long = 12_000L,
    private val writeTimeoutMs: Long = 4_000L,
) : Cp35Transport {
    companion object {
        private const val TAG = "Cp35Gatt"
        val UART_UUID: UUID = UUID.fromString("0000FFE0-0000-1000-8000-00805F9B34FB")
        val RX_UUID: UUID = UUID.fromString("0000FFE1-0000-1000-8000-00805F9B34FB")
        val TX_UUID: UUID = UUID.fromString("0000FFE2-0000-1000-8000-00805F9B34FB")
        val PWD_UUID: UUID = UUID.fromString("0000FFE3-0000-1000-8000-00805F9B34FB")
        val CCCD_UUID: UUID = UUID.fromString("00002902-0000-1000-8000-00805F9B34FB")
    }

    private val adapter: BluetoothAdapter? =
        (context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager)?.adapter

    private var gatt: BluetoothGatt? = null
    private var tx: BluetoothGattCharacteristic? = null
    private var pwdTx: BluetoothGattCharacteristic? = null
    private val connected = AtomicBoolean(false)
    private val readyLatch = AtomicReference<CountDownLatch?>(null)
    private val writeLatch = AtomicReference<CountDownLatch?>(null)
    private val lastWriteOk = AtomicBoolean(false)

    override val isConnected: Boolean
        get() = connected.get() && gatt != null

    override fun connect(mac: String): Result<Unit> {
        disconnect()
        val bt = adapter ?: return Result.failure(Cp35ProvisionError.GattError("no_adapter"))
        if (!bt.isEnabled) return Result.failure(Cp35ProvisionError.GattError("bt_disabled"))
        val device: BluetoothDevice = try {
            bt.getRemoteDevice(mac)
        } catch (e: IllegalArgumentException) {
            return Result.failure(Cp35ProvisionError.BadArgs("invalid mac"))
        }
        val latch = CountDownLatch(1)
        readyLatch.set(latch)
        gatt = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            device.connectGatt(context, false, callback, BluetoothDevice.TRANSPORT_LE)
        } else {
            @Suppress("DEPRECATION")
            device.connectGatt(context, false, callback)
        }
        val ok = latch.await(connectTimeoutMs, TimeUnit.MILLISECONDS)
        if (!ok || !connected.get() || tx == null || pwdTx == null) {
            disconnect()
            return Result.failure(Cp35ProvisionError.Timeout("connect"))
        }
        return Result.success(Unit)
    }

    override fun writePassword(passwordUtf8: ByteArray): Result<Unit> {
        val characteristic = pwdTx ?: return Result.failure(Cp35ProvisionError.NotConnected())
        val g = gatt ?: return Result.failure(Cp35ProvisionError.NotConnected())
        return writeCharacteristic(g, characteristic, passwordUtf8)
    }

    override fun writeCommand(frame: ByteArray): Result<Unit> {
        val characteristic = tx ?: return Result.failure(Cp35ProvisionError.NotConnected())
        val g = gatt ?: return Result.failure(Cp35ProvisionError.NotConnected())
        return writeCharacteristic(g, characteristic, frame)
    }

    override fun disconnect() {
        connected.set(false)
        try {
            gatt?.disconnect()
            gatt?.close()
        } catch (_: Exception) {
            // ignore cleanup errors
        }
        gatt = null
        tx = null
        pwdTx = null
        readyLatch.getAndSet(null)?.countDown()
        writeLatch.getAndSet(null)?.countDown()
    }

    private fun writeCharacteristic(
        g: BluetoothGatt,
        characteristic: BluetoothGattCharacteristic,
        value: ByteArray,
    ): Result<Unit> {
        val latch = CountDownLatch(1)
        writeLatch.set(latch)
        lastWriteOk.set(false)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            val status = g.writeCharacteristic(
                characteristic,
                value,
                BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT,
            )
            if (status != BluetoothGatt.GATT_SUCCESS) {
                return Result.failure(Cp35ProvisionError.GattError("write_submit"))
            }
        } else {
            @Suppress("DEPRECATION")
            characteristic.value = value
            @Suppress("DEPRECATION")
            characteristic.writeType = BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT
            @Suppress("DEPRECATION")
            if (!g.writeCharacteristic(characteristic)) {
                return Result.failure(Cp35ProvisionError.GattError("write_submit"))
            }
        }
        val ok = latch.await(writeTimeoutMs, TimeUnit.MILLISECONDS)
        if (!ok) return Result.failure(Cp35ProvisionError.Timeout("write"))
        if (!lastWriteOk.get()) return Result.failure(Cp35ProvisionError.GattError("write_status"))
        return Result.success(Unit)
    }

    private val callback = object : BluetoothGattCallback() {
        override fun onConnectionStateChange(gatt: BluetoothGatt, status: Int, newState: Int) {
            if (newState == BluetoothProfile.STATE_CONNECTED && status == BluetoothGatt.GATT_SUCCESS) {
                Log.d(TAG, "connected; discovering services")
                gatt.discoverServices()
            } else if (newState == BluetoothProfile.STATE_DISCONNECTED) {
                connected.set(false)
                readyLatch.get()?.countDown()
            }
        }

        override fun onServicesDiscovered(gatt: BluetoothGatt, status: Int) {
            if (status != BluetoothGatt.GATT_SUCCESS) {
                readyLatch.get()?.countDown()
                return
            }
            val service = gatt.getService(UART_UUID)
            if (service == null) {
                Log.w(TAG, "FFE0 service missing")
                readyLatch.get()?.countDown()
                return
            }
            tx = service.getCharacteristic(TX_UUID)
            pwdTx = service.getCharacteristic(PWD_UUID)
            val rx = service.getCharacteristic(RX_UUID)
            if (tx == null || pwdTx == null || rx == null) {
                readyLatch.get()?.countDown()
                return
            }
            gatt.setCharacteristicNotification(rx, true)
            val desc = rx.getDescriptor(CCCD_UUID)
            if (desc != null) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    gatt.writeDescriptor(desc, BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE)
                } else {
                    @Suppress("DEPRECATION")
                    desc.value = BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE
                    @Suppress("DEPRECATION")
                    gatt.writeDescriptor(desc)
                }
            } else {
                connected.set(true)
                readyLatch.get()?.countDown()
            }
        }

        override fun onDescriptorWrite(
            gatt: BluetoothGatt,
            descriptor: BluetoothGattDescriptor,
            status: Int,
        ) {
            if (status == BluetoothGatt.GATT_SUCCESS) {
                connected.set(true)
            }
            readyLatch.get()?.countDown()
        }

        override fun onCharacteristicWrite(
            gatt: BluetoothGatt,
            characteristic: BluetoothGattCharacteristic,
            status: Int,
        ) {
            lastWriteOk.set(status == BluetoothGatt.GATT_SUCCESS)
            writeLatch.get()?.countDown()
        }
    }
}
