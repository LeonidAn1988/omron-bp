package io.github.leonidan1988.omronbp;

import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Переходы на системные экраны, которых нет в готовых плагинах.
 *
 * Звук и громкость уведомления на Android 8 и новее принадлежат не приложению,
 * а каналу уведомлений, и меняются только в настройках системы. Приложение
 * вправе туда привести, но не вправе менять за человека — поэтому здесь ровно
 * переходы, без единой записи в настройки.
 *
 * Второй экран — энергосбережение. Huawei, Xiaomi и Samsung усыпляют фоновые
 * приложения, и напоминание о лекарстве не приходит вовсе. Это главная причина
 * молчащих будильников на Android, и человеку нужен путь к тому переключателю,
 * а не совет «поищите в настройках».
 */
@CapacitorPlugin(name = "SystemSettings")
public class SystemSettings extends Plugin {

    /** Экран одного канала уведомлений: мелодия, громкость, вибрация, важность. */
    @PluginMethod
    public void openChannel(PluginCall call) {
        String channelId = call.getString("channelId");
        if (channelId == null) {
            call.reject("не указан канал");
            return;
        }
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            // До Android 8 каналов не существует, и звук задаётся самим
            // уведомлением. Отдельного экрана нет — ведём в общие настройки.
            openAppNotifications(call);
            return;
        }
        Intent intent = new Intent(Settings.ACTION_CHANNEL_NOTIFICATION_SETTINGS)
                .putExtra(Settings.EXTRA_APP_PACKAGE, getContext().getPackageName())
                .putExtra(Settings.EXTRA_CHANNEL_ID, channelId)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        start(intent, call);
    }

    /** Все уведомления приложения — запасной путь, если канал ещё не создан. */
    @PluginMethod
    public void openAppNotifications(PluginCall call) {
        Intent intent;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            intent = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                    .putExtra(Settings.EXTRA_APP_PACKAGE, getContext().getPackageName());
        } else {
            intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
                    .setData(Uri.parse("package:" + getContext().getPackageName()));
        }
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        start(intent, call);
    }

    /**
     * Стоит ли на приложении ограничение энергосбережения.
     *
     * Читаем, а не меняем: снять ограничение вправе только человек. Нужно ровно
     * для того, чтобы не пугать предупреждением того, у кого всё в порядке —
     * предупреждение, которое висит всегда, перестают читать.
     *
     * Ответ неполный, и это надо помнить. Android отвечает про свой список
     * исключений, а у Huawei, Xiaomi и Samsung поверх него есть собственное
     * управление запуском приложений, о котором система ничего не сообщает.
     * Поэтому `false` здесь значит «системных ограничений нет», а не
     * «напоминания точно придут».
     */
    @PluginMethod
    public void isBatteryRestricted(PluginCall call) {
        JSObject result = new JSObject();
        try {
            PowerManager power = (PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
            boolean свободно = power != null
                    && power.isIgnoringBatteryOptimizations(getContext().getPackageName());
            result.put("restricted", !свободно);
        } catch (Exception error) {
            // Прошивка могла не ответить. Молчим, а не пугаем: интерфейс на
            // `null` просто не показывает предупреждение.
            result.put("restricted", null);
        }
        call.resolve(result);
    }

    /**
     * Включён ли сейчас режим «Не беспокоить».
     *
     * В этом режиме уведомление приходит молча — приложение об этом узнать
     * обязано, потому что беззвучное напоминание о лекарстве равно
     * отсутствующему. Разрешения не требует: читаем состояние, не меняем его.
     */
    @PluginMethod
    public void isDoNotDisturbOn(PluginCall call) {
        JSObject result = new JSObject();
        try {
            NotificationManager manager =
                    (NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
            int фильтр = manager == null
                    ? NotificationManager.INTERRUPTION_FILTER_ALL
                    : manager.getCurrentInterruptionFilter();
            result.put("on", фильтр != NotificationManager.INTERRUPTION_FILTER_ALL
                    && фильтр != NotificationManager.INTERRUPTION_FILTER_UNKNOWN);
        } catch (Exception error) {
            result.put("on", null);
        }
        call.resolve(result);
    }

    /**
     * Системный список «Батарея — приложения без ограничений».
     *
     * Отдельно от настроек приложения: здесь человек сразу видит нужный
     * переключатель, а не ищет его среди прочего. Разрешения не требует —
     * в отличие от прямого запроса на исключение, который магазины отдают
     * закрытым списком категорий.
     */
    @PluginMethod
    public void openBatteryOptimization(PluginCall call) {
        Intent intent = new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        start(intent, call);
    }

    /**
     * Настройки приложения: оттуда человек доходит до «Батарея» и снимает
     * ограничения. Прямого экрана энергосбережения у производителей нет —
     * у каждого он свой и по имени не вызывается.
     */
    @PluginMethod
    public void openAppDetails(PluginCall call) {
        Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
                .setData(Uri.parse("package:" + getContext().getPackageName()))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        start(intent, call);
    }

    private void start(Intent intent, PluginCall call) {
        try {
            getContext().startActivity(intent);
            JSObject result = new JSObject();
            result.put("opened", true);
            call.resolve(result);
        } catch (Exception error) {
            // Экран может отсутствовать на нестандартной прошивке. Сообщаем
            // честно, чтобы интерфейс сказал «откройте настройки сами», а не
            // сделал вид, что перешёл.
            call.reject("не удалось открыть системный экран", error);
        }
    }
}
