package it.mvtechcore.mvanager;

import android.content.Context;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.AtomicFile;
import org.json.JSONObject;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/** The widget credential and offline agenda are encrypted and excluded from backup. */
final class AgendaWidgetStore {
    private static final String ALIAS = "mvanager.agenda.widget";
    private static AtomicFile file(Context c) { return new AtomicFile(new File(c.getNoBackupFilesDir(), "agenda-widget.enc")); }
    private static SecretKey key() throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore"); store.load(null);
        if (!store.containsAlias(ALIAS)) {
            KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
            generator.init(new KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
            generator.generateKey();
        }
        return (SecretKey) store.getKey(ALIAS, null);
    }
    static synchronized JSONObject read(Context c) {
        try {
            byte[] bytes = file(c).readFully();
            if (bytes.length < 29) return new JSONObject();
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, bytes, 0, 12));
            return new JSONObject(new String(cipher.doFinal(bytes, 12, bytes.length - 12), StandardCharsets.UTF_8));
        } catch (Exception ignored) { return new JSONObject(); }
    }
    static synchronized void write(Context c, JSONObject value) throws Exception {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding"); cipher.init(Cipher.ENCRYPT_MODE, key());
        AtomicFile target = file(c); FileOutputStream stream = target.startWrite();
        try {
            stream.write(cipher.getIV()); stream.write(cipher.doFinal(value.toString().getBytes(StandardCharsets.UTF_8)));
            target.finishWrite(stream);
        } catch (Exception error) { target.failWrite(stream); throw error; }
    }
    static synchronized void clear(Context c) { file(c).delete(); }
    static synchronized boolean commit(Context c, String token, JSONObject feed, boolean offline) throws Exception {
        JSONObject current = read(c);
        if (!token.equals(current.optString("token"))) return false;
        if (feed != null) current.put("feed", feed);
        current.put("offline", offline); write(c, current); return true;
    }
    static synchronized void invalidate(Context c, String token) {
        if (token.equals(read(c).optString("token"))) clear(c);
    }
}
