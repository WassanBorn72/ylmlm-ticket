package jp.ylmlm.unofficial.ticket.widget

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.os.Build
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONObject

class TicketWidgetModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("TicketWidget")
    AsyncFunction("updateSnapshot") { value: String ->
      val context = appContext.reactContext ?: throw IllegalStateException("App context unavailable")
      JSONObject(value) // Validate before replacing the last usable snapshot.
      context.getSharedPreferences("ticket_widget", 0).edit().putString("snapshot", value).apply()
      FavoriteShowsWidgetProvider.updateAll(context)
    }
    AsyncFunction("requestPin") { favorites: Boolean ->
      val context = appContext.reactContext ?: throw IllegalStateException("App context unavailable")
      val manager = AppWidgetManager.getInstance(context)
      if (Build.VERSION.SDK_INT >= 26 && manager.isRequestPinAppWidgetSupported) {
        val provider = if (favorites) FavoriteShowsWidgetProvider::class.java else UpcomingShowsWidgetProvider::class.java
        manager.requestPinAppWidget(ComponentName(context, provider), null, null)
      } else false
    }
  }
}
