package ir.owj.otpcompanion

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.app.PendingIntent
import android.os.Bundle
import android.provider.Settings
import android.text.InputType
import android.view.ViewGroup
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.activity.result.IntentSenderRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import com.google.android.gms.auth.api.phone.SmsRetriever
import com.google.android.gms.common.api.CommonStatusCodes
import com.google.android.gms.common.api.Status
import org.json.JSONObject
import java.util.concurrent.Executors

class MainActivity : AppCompatActivity() {
    private val executor = Executors.newSingleThreadExecutor()
    private val handler by lazy { android.os.Handler(mainLooper) }
    private val preferences by lazy { getSharedPreferences("owj-otp", MODE_PRIVATE) }

    private lateinit var backendInput: EditText
    private lateinit var phoneInput: EditText
    private lateinit var enrollmentInput: EditText
    private lateinit var manualOtpInput: EditText
    private lateinit var statusText: TextView
    private lateinit var listenButton: Button

    private var polling = false
    private var receiverRegistered = false
    private var currentRequestId: String? = null

    private val consentLauncher = registerForActivityResult(
        ActivityResultContracts.StartIntentSenderForResult(),
    ) { result ->
        if (result.resultCode != RESULT_OK) {
            setStatus("SMS sharing was not approved. You can enter the OTP manually.")
            return@registerForActivityResult
        }
        val message = result.data?.getStringExtra(SmsRetriever.EXTRA_SMS_MESSAGE).orEmpty()
        val otp = Regex("(?<!\\d)\\d{4,8}(?!\\d)").find(message)?.value
        if (otp == null) {
            setStatus("No 4–8 digit OTP was found in the approved message.")
        } else {
            manualOtpInput.setText(otp)
            submitOtp(otp)
        }
    }

    private val smsReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            if (intent?.action != SmsRetriever.SMS_RETRIEVED_ACTION) return
            val extras = intent.extras ?: return
            val status = extras.get(SmsRetriever.EXTRA_STATUS) as? Status ?: return
            when (status.statusCode) {
                CommonStatusCodes.SUCCESS -> {
                    @Suppress("DEPRECATION")
                    val consentIntent = extras.getParcelable<PendingIntent>(SmsRetriever.EXTRA_CONSENT_INTENT)
                    if (consentIntent != null) {
                        consentLauncher.launch(IntentSenderRequest.Builder(consentIntent.intentSender).build())
                    }
                }
                CommonStatusCodes.TIMEOUT -> setStatus("Timed out waiting for the OTP. Queue a fresh login request.")
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        buildUi()
        loadSettings()
        registerSmsReceiver()
    }

    override fun onDestroy() {
        polling = false
        handler.removeCallbacksAndMessages(null)
        if (receiverRegistered) unregisterReceiver(smsReceiver)
        executor.shutdownNow()
        super.onDestroy()
    }

    private fun buildUi() {
        val density = resources.displayMetrics.density
        val padding = (20 * density).toInt()
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(padding, padding, padding, padding)
        }
        fun field(hint: String, inputType: Int = InputType.TYPE_CLASS_TEXT) = EditText(this).apply {
            this.hint = hint
            this.inputType = inputType
            layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)
            root.addView(this)
        }
        root.addView(TextView(this).apply {
            text = "Owj OTP Companion"
            textSize = 24f
        })
        root.addView(TextView(this).apply {
            text = "This app accesses only one OTP after Android displays a consent prompt. Keep it open during the initial test."
            textSize = 15f
        })
        backendInput = field("Backend URL, e.g. http://192.168.1.20:3456", InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_URI)
        phoneInput = field("Phone, e.g. 09123456789", InputType.TYPE_CLASS_PHONE)
        enrollmentInput = field("One-time enrollment key", InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD)

        root.addView(Button(this).apply {
            text = "Register this device"
            setOnClickListener { registerDevice() }
        })
        listenButton = Button(this).apply {
            text = "Start waiting for login requests"
            setOnClickListener { togglePolling() }
        }
        root.addView(listenButton)
        manualOtpInput = field("Manual OTP fallback", InputType.TYPE_CLASS_NUMBER)
        root.addView(Button(this).apply {
            text = "Submit OTP"
            setOnClickListener { submitOtp(manualOtpInput.text.toString().trim()) }
        })
        statusText = TextView(this).apply {
            text = "Not registered"
            textSize = 15f
            setPadding(0, padding, 0, 0)
        }
        root.addView(statusText)
        setContentView(ScrollView(this).apply { addView(root) })
    }

    private fun loadSettings() {
        backendInput.setText(preferences.getString("backend", "http://10.0.2.2:3456"))
        phoneInput.setText(preferences.getString("phone", ""))
        if (!preferences.getString("deviceToken", null).isNullOrBlank()) {
            statusText.text = "Device is registered. Start waiting when ready."
        }
    }

    private fun registerSmsReceiver() {
        ContextCompat.registerReceiver(
            this,
            smsReceiver,
            IntentFilter(SmsRetriever.SMS_RETRIEVED_ACTION),
            ContextCompat.RECEIVER_EXPORTED,
        )
        receiverRegistered = true
    }

    private fun deviceId(): String = "android-" + Settings.Secure.getString(
        contentResolver,
        Settings.Secure.ANDROID_ID,
    )

    private fun registerDevice() {
        val backend = backendInput.text.toString().trim()
        val phone = phoneInput.text.toString().trim()
        val enrollment = enrollmentInput.text.toString()
        if (!phone.matches(Regex("09\\d{9}"))) {
            setStatus("Enter a valid Iranian mobile number.")
            return
        }
        setStatus("Registering…")
        background {
            val response = ApiClient(backend).request(
                method = "POST",
                path = "/api/devices/register",
                headers = mapOf("x-enrollment-key" to enrollment),
                body = JSONObject()
                    .put("deviceId", deviceId())
                    .put("phone", phone)
                    .put("name", android.os.Build.MODEL),
            )
            val token = response.json.getString("deviceToken")
            preferences.edit()
                .putString("backend", backend)
                .putString("phone", phone)
                .putString("deviceToken", token)
                .apply()
            runOnUiThread { enrollmentInput.text.clear() }
            setStatus("Registered. You can now start waiting for requests.")
        }
    }

    private fun togglePolling() {
        if (polling) {
            polling = false
            listenButton.text = "Start waiting for login requests"
            setStatus("Waiting stopped.")
        } else {
            if (preferences.getString("deviceToken", null).isNullOrBlank()) {
                setStatus("Register this device first.")
                return
            }
            polling = true
            listenButton.text = "Stop waiting"
            setStatus("Waiting for a login request…")
            pollOnce()
        }
    }

    private fun pollOnce() {
        if (!polling) return
        background(onError = { error ->
            setStatus("Polling error: ${error.message}")
            schedulePoll()
        }) {
            val backend = preferences.getString("backend", "")!!
            val token = preferences.getString("deviceToken", "")!!
            val encodedDevice = java.net.URLEncoder.encode(deviceId(), Charsets.UTF_8.name())
            val response = ApiClient(backend).request(
                "GET",
                "/api/mobile/requests/next?deviceId=$encodedDevice",
                token,
            )
            val request = response.json.optJSONObject("request")
            if (request == null) {
                setStatus("Waiting for a login request…")
                schedulePoll()
                return@background
            }
            val id = request.getString("id")
            currentRequestId = id
            when (request.getString("status")) {
                "queued" -> beginOneMessageConsent(id)
                "awaiting_otp", "requesting_otp" -> {
                    setStatus("OTP requested for ${request.getString("phone")}. Approve it when Android prompts, or enter it manually.")
                    schedulePoll()
                }
                else -> schedulePoll()
            }
        }
    }

    private fun beginOneMessageConsent(requestId: String) {
        runOnUiThread {
            SmsRetriever.getClient(this).startSmsUserConsent(null)
                .addOnSuccessListener {
                    setStatus("Listening for one OTP; asking backend to send it…")
                    signalReady(requestId)
                }
                .addOnFailureListener { setStatus("Could not start SMS consent: ${it.message}") }
        }
    }

    private fun signalReady(requestId: String) {
        background {
            val backend = preferences.getString("backend", "")!!
            val token = preferences.getString("deviceToken", "")!!
            val response = ApiClient(backend).request(
                "POST",
                "/api/mobile/requests/$requestId/ready",
                token,
                body = JSONObject().put("deviceId", deviceId()),
            )
            val request = response.json.getJSONObject("request")
            setStatus("OTP sent to ${request.getString("phone")}; waiting for Android’s consent prompt…")
            schedulePoll()
        }
    }

    private fun submitOtp(otp: String) {
        val requestId = currentRequestId
        if (requestId == null) {
            setStatus("There is no active login request.")
            return
        }
        if (!otp.matches(Regex("\\d{4,8}"))) {
            setStatus("OTP must contain 4–8 digits.")
            return
        }
        setStatus("Verifying OTP…")
        background {
            val backend = preferences.getString("backend", "")!!
            val token = preferences.getString("deviceToken", "")!!
            ApiClient(backend).request(
                "POST",
                "/api/mobile/requests/$requestId/otp",
                token,
                body = JSONObject()
                    .put("deviceId", deviceId())
                    .put("otp", otp),
            )
            currentRequestId = null
            runOnUiThread { manualOtpInput.text.clear() }
            setStatus("Login completed. The token is encrypted on the backend.")
            schedulePoll()
        }
    }

    private fun schedulePoll() {
        handler.removeCallbacksAndMessages(null)
        if (polling) handler.postDelayed({ pollOnce() }, 3_000)
    }

    private fun setStatus(message: String) {
        runOnUiThread { statusText.text = message }
    }

    private fun background(onError: (Throwable) -> Unit = { setStatus("Error: ${it.message}") }, block: () -> Unit) {
        executor.execute {
            try {
                block()
            } catch (error: Throwable) {
                runOnUiThread { onError(error) }
            }
        }
    }
}
