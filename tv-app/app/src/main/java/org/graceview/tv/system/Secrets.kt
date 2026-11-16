package org.graceview.tv.system

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import android.util.Log
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * The Planning Center personal access token (application ID + secret), encrypted with a key kept in
 * the Android Keystore. Never put it in the Sheet, the repo or logs (CLAUDE.md).
 */
object Secrets {
    private const val KEY_ALIAS = "graceview-secrets"
    private const val PREFS = "secure"

    data class PlanningCenterToken(val appId: String, val secret: String)

    fun planningCenter(ctx: Context): PlanningCenterToken? = runCatching {
        val p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val id = p.getString("pco_id", null)?.let(::decrypt) ?: return null
        val secret = p.getString("pco_secret", null)?.let(::decrypt) ?: return null
        PlanningCenterToken(id, secret)
    }.getOrNull()

    fun savePlanningCenter(ctx: Context, appId: String, secret: String) {
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putString("pco_id", encrypt(appId))
            .putString("pco_secret", encrypt(secret))
            .apply()
    }

    fun clearPlanningCenter(ctx: Context) {
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().remove("pco_id").remove("pco_secret").apply()
    }

    private fun key(): SecretKey {
        val ks = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (ks.getKey(KEY_ALIAS, null) as? SecretKey)?.let { return it }
        val gen = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        gen.init(
            KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build(),
        )
        return gen.generateKey()
    }

    private fun encrypt(plain: String): String {
        val c = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.ENCRYPT_MODE, key()) }
        val out = c.iv + c.doFinal(plain.toByteArray(Charsets.UTF_8))
        return Base64.encodeToString(out, Base64.NO_WRAP)
    }

    private fun decrypt(stored: String): String {
        val b = Base64.decode(stored, Base64.NO_WRAP)
        val c = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, b, 0, 12)) }
        return String(c.doFinal(b, 12, b.size - 12), Charsets.UTF_8)
    }
}

/**
 * Receives the Planning Center token from setup-stick.ps1 (adb shell am broadcast). Only the adb
 * shell can send it: the manifest requires android.permission.DUMP, which ordinary apps can't hold.
 */
class TokenReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.getBooleanExtra("clear", false)) {
            Secrets.clearPlanningCenter(context)
            Log.i("TokenReceiver", "Planning Center token removed")
            resultCode = 1
            return
        }
        val id = intent.getStringExtra("pcoAppId")?.trim().orEmpty()
        val secret = intent.getStringExtra("pcoSecret")?.trim().orEmpty()
        if (id.isEmpty() || secret.isEmpty()) {
            Log.w("TokenReceiver", "Planning Center token not saved: missing application ID or secret")
            resultCode = 0
            return
        }
        Secrets.savePlanningCenter(context, id, secret)
        Log.i("TokenReceiver", "Planning Center token saved")
        resultCode = 1
    }
}
