package com.ainshop.app.camera

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.SystemClock
import kotlin.math.abs
import kotlin.math.sqrt

// AIN Shop — "take the photo when the phone is steady".
// A blind shopper cannot see whether the picture is framed, so the
// camera takes the photo itself once the phone has been held still for
// two seconds — or the shopper says "take it" at any time. Steadiness
// is measured with the accelerometer: when the change in acceleration
// stays tiny, the phone is still. This is a plain sensor reading, not
// a model, and it never guesses what is in the picture.

class SteadyDetector(
    context: Context,
    private val steadyMillis: Long = 2_000L,
    private val onSteady: () -> Unit,
) : SensorEventListener {

    private val sensorManager =
        context.getSystemService(Context.SENSOR_SERVICE) as SensorManager
    private val accelerometer: Sensor? =
        sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)

    private var lastMagnitude = 0f
    private var steadySince: Long? = null
    private var fired = false

    fun start() {
        fired = false
        steadySince = null
        lastMagnitude = 0f
        accelerometer?.let {
            sensorManager.registerListener(this, it, SensorManager.SENSOR_DELAY_NORMAL)
        }
    }

    fun stop() {
        sensorManager.unregisterListener(this)
    }

    override fun onSensorChanged(event: SensorEvent) {
        if (event.sensor.type != Sensor.TYPE_ACCELEROMETER) return
        val magnitude = sqrt(
            event.values[0] * event.values[0] +
                event.values[1] * event.values[1] +
                event.values[2] * event.values[2]
        )
        val delta = abs(magnitude - lastMagnitude)
        lastMagnitude = magnitude
        val now = SystemClock.elapsedRealtime()
        // Still: the acceleration barely changes (gravity alone is ~9.8).
        if (delta < 0.15f) {
            if (steadySince == null) steadySince = now
            if (!fired && steadySince != null && now - steadySince!! >= steadyMillis) {
                fired = true
                onSteady()
            }
        } else {
            steadySince = null
        }
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) = Unit
}
