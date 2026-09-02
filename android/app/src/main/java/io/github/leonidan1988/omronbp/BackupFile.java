package io.github.leonidan1988.omronbp;

import android.content.Intent;
import android.content.UriPermission;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;

/**
 * Копия дневника в файл, который выбрал человек.
 *
 * Приложение без спроса может писать только в свои каталоги, а оттуда файл не
 * достать: приватный не виден никому, `Android/data` с одиннадцатой версии
 * закрыт и для файловых менеджеров, и для системного выбора файла. Копия,
 * которую невозможно вернуть, гасит предупреждение «копии нет» и создаёт ложное
 * спокойствие ровно там, где приложение обещает обратное.
 *
 * Storage Access Framework это снимает: человек один раз указывает файл — хоть
 * в Яндекс.Диске, хоть в Google Drive, хоть в памяти телефона, — система выдаёт
 * долгоживущее разрешение, и дальше приложение пишет туда само. Облако при этом
 * принадлежит человеку: мы не становимся ни хранителем данных, ни оператором.
 *
 * Разрешение переживает перезагрузку, но не вечно: его снимает переустановка
 * приложения, очистка его данных и удаление самого файла. Поэтому у каждой
 * записи есть честный ответ «цель пропала», а не молчаливый отказ.
 */
@CapacitorPlugin(name = "BackupFile")
public class BackupFile extends Plugin {

    /**
     * Показать системное окно создания файла.
     *
     * Тип `application/json` и подсказанное имя: человек видит знакомое окно
     * своего файлового менеджера и сам выбирает, куда положить — в облако или в
     * память телефона. Мы не выбираем за него и не спрашиваем разрешений на всё
     * хранилище: доступ выдаётся к одному файлу.
     */
    @PluginMethod
    public void choose(PluginCall call) {
        String suggested = call.getString("suggestedName", "дневник-копия.json");
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT)
                .addCategory(Intent.CATEGORY_OPENABLE)
                .setType("application/json")
                .putExtra(Intent.EXTRA_TITLE, suggested);
        startActivityForResult(call, intent, "chosen");
    }

    @ActivityCallback
    private void chosen(PluginCall call, ActivityResult result) {
        if (call == null) return;
        Intent data = result.getData();
        Uri uri = data == null ? null : data.getData();
        if (uri == null) {
            // Окно закрыли — это не ошибка, а отказ. Отличать их обязательно:
            // на ошибке интерфейс кричит, на отказе молчит.
            JSObject empty = new JSObject();
            empty.put("cancelled", true);
            call.resolve(empty);
            return;
        }
        try {
            getContext().getContentResolver().takePersistableUriPermission(
                    uri, Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
        } catch (Exception error) {
            call.reject("система не выдала долгоживущий доступ к файлу", error);
            return;
        }
        JSObject out = new JSObject();
        out.put("cancelled", false);
        out.put("uri", uri.toString());
        out.put("name", displayName(uri));
        call.resolve(out);
    }

    /**
     * Выбрать чужой файл — копию другого телефона семьи, только для чтения.
     *
     * Отдельно от `choose`: тот создаёт файл и берёт право записи, а сюда
     * приложение обязано не писать вовсе. Чужая копия принадлежит другому
     * человеку, и портить её нам нечем — читаем и сливаем у себя.
     */
    @PluginMethod
    public void openSource(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT)
                .addCategory(Intent.CATEGORY_OPENABLE)
                .setType("*/*")
                .putExtra(Intent.EXTRA_MIME_TYPES, new String[] { "application/json", "text/plain", "*/*" });
        startActivityForResult(call, intent, "sourceOpened");
    }

    @ActivityCallback
    private void sourceOpened(PluginCall call, ActivityResult result) {
        if (call == null) return;
        Intent data = result.getData();
        Uri uri = data == null ? null : data.getData();
        if (uri == null) {
            JSObject empty = new JSObject();
            empty.put("cancelled", true);
            call.resolve(empty);
            return;
        }
        try {
            // Только чтение: права записи не просим и не берём. Если система
            // долгоживущего доступа не даст, синхронизация без него бессмысленна
            // — файл придётся выбирать заново при каждом запуске.
            getContext().getContentResolver().takePersistableUriPermission(
                    uri, Intent.FLAG_GRANT_READ_URI_PERMISSION);
        } catch (Exception error) {
            call.reject("система не выдала долгоживущий доступ к файлу", error);
            return;
        }
        JSObject out = new JSObject();
        out.put("cancelled", false);
        out.put("uri", uri.toString());
        out.put("name", displayName(uri));
        call.resolve(out);
    }

    /**
     * Записать копию.
     *
     * Режим `wt` усекает файл перед записью — иначе остаток прежнего, более
     * длинного содержимого дописался бы в хвост и сделал бы файл нечитаемым.
     * Содержимое отдаётся одним куском: чем меньше окно между усечением и
     * концом записи, тем меньше шанс, что прерванная запись оставит обрывок.
     */
    @PluginMethod
    public void write(PluginCall call) {
        String uriText = call.getString("uri");
        String content = call.getString("content");
        if (uriText == null || content == null) {
            call.reject("не указан файл или содержимое");
            return;
        }
        try (OutputStream stream = getContext().getContentResolver().openOutputStream(Uri.parse(uriText), "wt")) {
            if (stream == null) {
                call.reject("файл недоступен для записи");
                return;
            }
            stream.write(content.getBytes(StandardCharsets.UTF_8));
            stream.flush();
            JSObject out = new JSObject();
            out.put("ok", true);
            call.resolve(out);
        } catch (SecurityException error) {
            call.reject("доступ к файлу отозван", error);
        } catch (IOException error) {
            call.reject("не удалось записать файл", error);
        }
    }

    /** Прочитать копию — для восстановления на другом устройстве. */
    @PluginMethod
    public void read(PluginCall call) {
        String uriText = call.getString("uri");
        if (uriText == null) {
            call.reject("не указан файл");
            return;
        }
        try (InputStream stream = getContext().getContentResolver().openInputStream(Uri.parse(uriText))) {
            if (stream == null) {
                call.reject("файл недоступен для чтения");
                return;
            }
            ByteArrayOutputStream buffer = new ByteArrayOutputStream();
            byte[] chunk = new byte[8192];
            int read;
            while ((read = stream.read(chunk)) != -1) buffer.write(chunk, 0, read);
            JSObject out = new JSObject();
            out.put("content", buffer.toString("UTF-8"));
            call.resolve(out);
        } catch (SecurityException error) {
            call.reject("доступ к файлу отозван", error);
        } catch (IOException error) {
            call.reject("не удалось прочитать файл", error);
        }
    }

    /**
     * Цел ли доступ к файлу.
     *
     * Разрешение снимает переустановка приложения, очистка его данных и
     * удаление самого файла. Спрашивать надо до записи: иначе приложение
     * уверяет, что копии идут, когда цели давно нет.
     */
    @PluginMethod
    public void check(PluginCall call) {
        String uriText = call.getString("uri");
        JSObject out = new JSObject();
        if (uriText == null) {
            out.put("ok", false);
            call.resolve(out);
            return;
        }
        boolean held = false;
        try {
            List<UriPermission> granted = getContext().getContentResolver().getPersistedUriPermissions();
            for (UriPermission permission : granted) {
                if (permission.getUri().toString().equals(uriText) && permission.isWritePermission()) {
                    held = true;
                    break;
                }
            }
        } catch (Exception error) {
            held = false;
        }
        out.put("ok", held);
        out.put("name", held ? displayName(Uri.parse(uriText)) : null);
        call.resolve(out);
    }

    /**
     * Забыть файл.
     *
     * Сам файл не удаляем: он может оказаться единственной копией дневника, а
     * человек нажимал «не писать сюда больше», а не «сотрите мои данные».
     */
    @PluginMethod
    public void forget(PluginCall call) {
        String uriText = call.getString("uri");
        if (uriText != null) {
            try {
                getContext().getContentResolver().releasePersistableUriPermission(
                        Uri.parse(uriText),
                        Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
            } catch (Exception error) {
                // Разрешения уже нет — цель всё равно забыта.
            }
        }
        call.resolve();
    }

    /** Имя файла, как его показывает система: человеку нужно узнать своё место. */
    private String displayName(Uri uri) {
        try (Cursor cursor = getContext().getContentResolver().query(uri, null, null, null, null)) {
            if (cursor != null && cursor.moveToFirst()) {
                int column = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                if (column >= 0) return cursor.getString(column);
            }
        } catch (Exception error) {
            // Имя не критично: цель узнаётся и по самому факту доступа.
        }
        return "копия дневника";
    }
}
