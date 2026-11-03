package jp.ylmlm.unofficial.ticket.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.os.Build
import android.widget.RemoteViews

open class FavoriteShowsWidgetProvider : AppWidgetProvider() {
  protected open val favoritesOnly = true
  override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
    ids.forEach { render(context, manager, it, favoritesOnly) }
  }
  override fun onAppWidgetOptionsChanged(context: Context, manager: AppWidgetManager, id: Int, options: Bundle) {
    render(context, manager, id, favoritesOnly)
  }
  override fun onReceive(context: Context, intent: Intent) {
    if(intent.action == ACTION_OPEN) { openEvent(context,intent);return }
    super.onReceive(context, intent)
    if (intent.action == Intent.ACTION_DATE_CHANGED || intent.action == Intent.ACTION_TIMEZONE_CHANGED) updateAll(context)
  }
  companion object {
    internal const val ACTION_OPEN="jp.ylmlm.unofficial.ticket.widget.OPEN"
    fun updateAll(context: Context) {
      val manager = AppWidgetManager.getInstance(context)
      listOf(FavoriteShowsWidgetProvider::class.java to true, UpcomingShowsWidgetProvider::class.java to false).forEach { (type, favorites) ->
        manager.getAppWidgetIds(ComponentName(context, type)).forEach { render(context, manager, it, favorites) }
      }
    }
    private fun openEvent(context: Context, input: Intent) {
      val eventId=input.getStringExtra("eventId") ?: return
      if(!Regex("[a-zA-Z0-9_-]{1,128}").matches(eventId)) return
      val intent=if(input.getBooleanExtra("map",false)) {
        val query=input.getStringExtra("mapQuery")?.takeIf{it.isNotBlank()} ?: return
        Intent(Intent.ACTION_VIEW,Uri.parse("https://www.google.com/maps/search/?api=1&query="+Uri.encode(query)))
      } else {
        val launch=context.packageManager.getLaunchIntentForPackage(context.packageName) ?: return
        val uri=Uri.Builder().scheme("ylmlm-unofficial-ticket").authority("event").appendPath(eventId)
        for(key in listOf("date","title","url")) input.getStringExtra(key)?.let{uri.appendQueryParameter(key,it)}
        launch.apply{action=Intent.ACTION_VIEW;data=uri.build()}
      }
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
      try {context.startActivity(intent)} catch(_: android.content.ActivityNotFoundException) { /* No handler installed. */ }
    }
    private fun render(context: Context, manager: AppWidgetManager, id: Int, favorites: Boolean) {
      val snapshot=TicketEventsFactory.snapshot(context)
      val views=RemoteViews(context.packageName,R.layout.ticket_widget_list)
      views.setTextViewText(R.id.ticket_widget_mode,if(favorites) "お気に入り" else "直近")
      views.setTextViewText(R.id.ticket_widget_updated,snapshot.optString("updatedShort",snapshot.optString("updatedLabel","アプリを開いて更新").substringBefore(" · ")))
      views.setTextViewText(R.id.ticket_widget_empty,if(favorites) "掲載中のお気に入りはありません。\nアプリで登録・更新" else "公演情報がありません。\nアプリで更新")
      val overview=context.packageManager.getLaunchIntentForPackage(context.packageName)?.apply {
        action=Intent.ACTION_VIEW;data=Uri.parse("ylmlm-unofficial-ticket://"+if(favorites) "favorites" else "tickets")
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
      }
      overview?.let {
        val pending=PendingIntent.getActivity(context,id,it,PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        for(viewId in listOf(R.id.ticket_widget_header,R.id.ticket_widget_footer,R.id.ticket_widget_empty)) views.setOnClickPendingIntent(viewId,pending)
      }
      // A collection's viewport is measured by the launcher. Never infer a row
      // count from min/max options or measure cards in a different font context.
      val service=Intent(context,TicketEventsService::class.java).putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID,id).putExtra("favorites",favorites)
      service.data=Uri.parse("ylmlm-widget://events/$id/$favorites")
      @Suppress("DEPRECATION")
      views.setRemoteAdapter(R.id.ticket_widget_events,service)
      views.setEmptyView(R.id.ticket_widget_events,R.id.ticket_widget_empty)
      val click=Intent(context,FavoriteShowsWidgetProvider::class.java).setAction(ACTION_OPEN).setData(Uri.parse("ylmlm-widget://click/$id"))
      val mutable=if(Build.VERSION.SDK_INT >= 31) PendingIntent.FLAG_MUTABLE else 0
      views.setPendingIntentTemplate(R.id.ticket_widget_events,PendingIntent.getBroadcast(context,id,click,PendingIntent.FLAG_UPDATE_CURRENT or mutable))
      manager.updateAppWidget(id,views)
      @Suppress("DEPRECATION")
      manager.notifyAppWidgetViewDataChanged(id,R.id.ticket_widget_events)
    }
  }
}
class UpcomingShowsWidgetProvider : FavoriteShowsWidgetProvider() {
  override val favoritesOnly = false
}
