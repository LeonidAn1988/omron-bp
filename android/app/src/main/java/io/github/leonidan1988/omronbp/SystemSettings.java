package io.github.leonidan1988.omronbp;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.provider.Settings;
import android.webkit.WebView;

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
     * Создать канал напоминаний своими руками.
     *
     * Плагин уведомлений канал создать умеет, но не умеет главного —
     * `setBypassDnd`. В режиме «Не беспокоить» напоминание приходит молча, а
     * беззвучное напоминание о лекарстве равно отсутствующему: телефон лежит
     * экраном вниз, и человек про таблетку не узнаёт.
     *
     * Обход тихого режима система отдаёт только приложениям, которым человек
     * выдал доступ к политике уведомлений. Не выдал — канал создаётся обычным,
     * и приложение об этом честно пишет, а не делает вид, что всё в порядке.
     *
     * Звук задаётся с `USAGE_ALARM`: напоминание о лекарстве ближе к будильнику,
     * чем к письму, и громкостью должно идти по той же шкале.
     */
    @PluginMethod
    public void createMedsChannel(PluginCall call) {
        String id = call.getString("id");
        String sound = call.getString("sound");
        if (id == null) {
            call.reject("не указан канал");
            return;
        }
        JSObject result = new JSObject();
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            // До Android 8 каналов нет: звук задаёт само уведомление.
            result.put("bypassDnd", false);
            call.resolve(result);
            return;
        }
        try {
            NotificationManager manager =
                    (NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
            if (manager == null) {
                call.reject("система не отдала менеджер уведомлений");
                return;
            }

            NotificationChannel channel = new NotificationChannel(
                    id, "Приём лекарств", NotificationManager.IMPORTANCE_HIGH);
            channel.setDescription("Напоминания принять препарат по расписанию");
            channel.enableVibration(true);
            channel.setLockscreenVisibility(android.app.Notification.VISIBILITY_PUBLIC);

            if (sound != null && !sound.isEmpty()) {
                Uri uri = Uri.parse("android.resource://" + getContext().getPackageName() + "/raw/" + sound);
                channel.setSound(uri, new AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_ALARM)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .build());
            }

            boolean allowed = manager.isNotificationPolicyAccessGranted();
            if (allowed) channel.setBypassDnd(true);

            manager.createNotificationChannel(channel);
            result.put("bypassDnd", allowed);
            call.resolve(result);
        } catch (Exception error) {
            call.reject("не удалось создать канал", error);
        }
    }

    /** Выдан ли доступ к политике уведомлений — без него тихий режим не обойти. */
    @PluginMethod
    public void canBypassDoNotDisturb(PluginCall call) {
        JSObject result = new JSObject();
        try {
            NotificationManager manager =
                    (NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
            result.put("allowed", manager != null
                    && Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
                    && manager.isNotificationPolicyAccessGranted());
        } catch (Exception error) {
            result.put("allowed", false);
        }
        call.resolve(result);
    }

    /** Экран, где этот доступ выдаётся. */
    @PluginMethod
    public void openDoNotDisturbAccess(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
            openAppNotifications(call);
            return;
        }
        start(new Intent(Settings.ACTION_NOTIFICATION_POLICY_ACCESS_SETTINGS)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK), call);
    }

    /**
     * Системная печать текущей страницы — она же «Сохранить в PDF».
     *
     * `window.print()` внутри WebView не делает ничего: диалога печати у него
     * нет. Между тем отчёт врачу — то, ради чего дневник и ведут, и кнопка,
     * которая молча ничего не делает, здесь хуже отсутствующей.
     *
     * Android умеет напечатать содержимое WebView штатно, и в системном
     * диалоге среди принтеров есть «Сохранить в PDF» — то самое, что нужно,
     * чтобы отправить отчёт файлом.
     *
     * Печать обязана запускаться из главного потока: WebView из другого потока
     * трогать нельзя.
     */
    @PluginMethod
    public void printPage(PluginCall call) {
        String jobName = call.getString("jobName", "Отчёт");
        getActivity().runOnUiThread(() -> {
            try {
                WebView webView = getBridge().getWebView();
                PrintManager manager = (PrintManager) getContext().getSystemService(Context.PRINT_SERVICE);
                if (webView == null || manager == null) {
                    call.reject("печать недоступна на этом устройстве");
                    return;
                }
                PrintDocumentAdapter adapter = webView.createPrintDocumentAdapter(jobName);
                manager.print(jobName, adapter, new PrintAttributes.Builder().build());
                JSObject result = new JSObject();
                result.put("started", true);
                call.resolve(result);
            } catch (Exception error) {
                call.reject("не удалось открыть печать", error);
            }
        });
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
    /**
     * Открыть ссылку в браузере, а не в приложении, которое её перехватывает.
     *
     * Проверено на приборе: ссылка на поиск в аптеке уводила в установленное
     * приложение сети — и оно открывалось на своей главной, потеряв запрос.
     * Человек нажимал «Аптека.ру» у амлодипина и попадал в каталог «Витамины и
     * бад», а искать приходилось заново. Поэтому адрес отдаём именно браузеру:
     * запрос он выполняет как написано.
     */
    @PluginMethod
    public void openInBrowser(PluginCall call) {
        String url = call.getString("url");
        if (url == null) {
            call.reject("нет адреса");
            return;
        }
        Uri uri = Uri.parse(url);
        Intent intent = new Intent(Intent.ACTION_VIEW, uri);
        intent.addCategory(Intent.CATEGORY_BROWSABLE);
        intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            // Спрашиваем систему, кто у неё браузер по умолчанию, и отдаём
            // адрес прямо ему. Без этого Android отдал бы ссылку приложению
            // аптеки: у сетей включены «ссылки приложения» на свой домен.
            Intent probe = new Intent(Intent.ACTION_VIEW, Uri.parse("http://example.com"));
            android.content.pm.ResolveInfo browser = getContext()
                    .getPackageManager()
                    .resolveActivity(probe, android.content.pm.PackageManager.MATCH_DEFAULT_ONLY);
            if (browser != null && browser.activityInfo != null) {
                intent.setPackage(browser.activityInfo.packageName);
            }
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception error) {
            // Браузера может не оказаться вовсе. Тогда пусть решает система —
            // приложение аптеки лучше, чем ничего.
            try {
                getContext().startActivity(new Intent(Intent.ACTION_VIEW, uri).setFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
                call.resolve();
            } catch (Exception second) {
                call.reject("не удалось открыть ссылку", second);
            }
        }
    }
}
