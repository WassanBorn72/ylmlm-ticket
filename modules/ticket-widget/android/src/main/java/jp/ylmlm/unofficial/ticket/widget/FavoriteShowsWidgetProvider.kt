package jp.ylmlm.unofficial.ticket.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.view.View
import android.widget.RemoteViews
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

open class FavoriteShowsWidgetProvider : AppWidgetProvider() {
  protected open val favoritesOnly = true
  override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
    ids.forEach { render(context, manager, it, favoritesOnly) }
  }
  override fun onAppWidgetOptionsChanged(context: Context, manager: AppWidgetManager, id: Int, options: Bundle) {
    render(context, manager, id, favoritesOnly, options)
  }
  override fun onReceive(context: Context, intent: Intent) {
    super.onReceive(context, intent)
    if (intent.action == Intent.ACTION_DATE_CHANGED || intent.action == Intent.ACTION_TIMEZONE_CHANGED) updateAll(context)
  }
  companion object {
    fun updateAll(context: Context) {
      val manager = AppWidgetManager.getInstance(context)
      listOf(FavoriteShowsWidgetProvider::class.java to true, UpcomingShowsWidgetProvider::class.java to false).forEach { (type, favorites) ->
        manager.getAppWidgetIds(ComponentName(context, type)).forEach { render(context, manager, it, favorites) }
      }
    }
    private fun open(context: Context, widgetId: Int, row: Int, target: String): PendingIntent? {
      val intent = context.packageManager.getLaunchIntentForPackage(context.packageName) ?: return null
      intent.action = Intent.ACTION_VIEW
      intent.data = Uri.parse("ylmlm-unofficial-ticket://$target")
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
      return PendingIntent.getActivity(context, widgetId * 10 + row, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }
    private fun render(context: Context, manager: AppWidgetManager, id: Int, favorites: Boolean, options: Bundle? = null) {
      val snapshot = try { JSONObject(context.getSharedPreferences("ticket_widget", 0).getString("snapshot", "{}") ?: "{}") } catch (_: Exception) { JSONObject() }
      val today = SimpleDateFormat("yyyy-MM-dd", Locale.JAPAN).apply { timeZone = TimeZone.getTimeZone("Asia/Tokyo") }.format(Date())
      val input = snapshot.optJSONArray("events")
      val events = (0 until (input?.length() ?: 0)).mapNotNull { input?.optJSONObject(it) }.filter { it.optString("date") >= today && (!favorites || it.optBoolean("favorite")) }.sortedWith(compareBy({it.optString("date")}, {it.optString("sortTime")}, {it.optString("id")}))
      val views = RemoteViews(context.packageName, R.layout.ticket_widget)
      val size = options ?: manager.getAppWidgetOptions(id)
      val height = size.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT,180)
      val width = size.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH,300)
      val scale = maxOf(1f, context.resources.configuration.fontScale)
      val compact = height < (330 * scale).toInt()
      val reserve = if(compact) 72 else 96
      val rowHeight = if(compact) 100 else 120
      val limit = ((height - (reserve * scale).toInt()) / (rowHeight * scale).toInt()).coerceIn(1,2)
      val titleLines = if(compact) 1 else 2
      val padding = (if(compact) 8 else 12) * context.resources.displayMetrics.density
      views.setViewPadding(R.id.ticket_widget_root,padding.toInt(),padding.toInt(),padding.toInt(),padding.toInt())
      views.setViewVisibility(R.id.ticket_widget_heading,if(compact) View.GONE else View.VISIBLE)
      views.setTextViewText(R.id.ticket_widget_mode, if(favorites) {if(width<260) "お気に入り" else "お気に入りの公演"} else "直近の公演")
      val overview = open(context,id,9,if(favorites) "favorites" else "tickets")
      overview?.let { views.setOnClickPendingIntent(R.id.ticket_widget_root,it);views.setOnClickPendingIntent(R.id.ticket_widget_footer,it) }
      val rows = intArrayOf(R.id.ticket_row_0,R.id.ticket_row_1,R.id.ticket_row_2)
      val titles = intArrayOf(R.id.ticket_title_0,R.id.ticket_title_1,R.id.ticket_title_2)
      val times = intArrayOf(R.id.ticket_time_0,R.id.ticket_time_1,R.id.ticket_time_2)
      val metas = intArrayOf(R.id.ticket_meta_0,R.id.ticket_meta_1,R.id.ticket_meta_2)
      val months = intArrayOf(R.id.ticket_month_0,R.id.ticket_month_1,R.id.ticket_month_2)
      val days = intArrayOf(R.id.ticket_day_0,R.id.ticket_day_1,R.id.ticket_day_2)
      val weekdays = intArrayOf(R.id.ticket_weekday_0,R.id.ticket_weekday_1,R.id.ticket_weekday_2)
      rows.forEachIndexed { index,row ->
        val event = events.getOrNull(index)
        if(event == null || index >= limit) views.setViewVisibility(row,View.GONE)
        else {
          views.setViewVisibility(row,View.VISIBLE)
          views.setTextViewText(titles[index],event.optString("title"))
          views.setInt(titles[index],"setMaxLines",titleLines)
          val summary = event.optString("summary")
          views.setTextViewText(times[index],event.optString("timeLabel",summary.substringBefore(" · ").substringAfter(" ","時間未掲載")))
          views.setTextViewText(metas[index],event.optString("venueLabel",summary.substringAfter(" · ","会場はアプリで確認")))
          val day = try { SimpleDateFormat("yyyy-MM-dd",Locale.JAPAN).apply{timeZone=TimeZone.getTimeZone("Asia/Tokyo");isLenient=false}.parse(event.optString("date")) } catch (_:Exception){null}
          if(day!=null){
            fun label(pattern:String)=SimpleDateFormat(pattern,Locale.JAPAN).apply{timeZone=TimeZone.getTimeZone("Asia/Tokyo")}.format(day)
            views.setTextViewText(months[index],label("M月"))
            views.setTextViewText(days[index],label("d"))
            val weekday=label("EEE")
            views.setTextViewText(weekdays[index],weekday)
            views.setTextColor(weekdays[index],android.graphics.Color.parseColor(if(weekday=="日") "#B34C58" else if(weekday=="土") "#416EA2" else "#287B59"))
          }else{views.setTextViewText(months[index],"--月");views.setTextViewText(days[index],"--")}
          views.setViewVisibility(weekdays[index],if(compact) View.GONE else View.VISIBLE)
          views.setContentDescription(row,event.optString("title") + " " + event.optString("summary"))
          open(context,id,index,"event/"+Uri.encode(event.optString("id")))?.let { views.setOnClickPendingIntent(row,it) }
        }
      }
      views.setViewVisibility(R.id.ticket_widget_empty,if(events.isEmpty()) View.VISIBLE else View.GONE)
      views.setTextViewText(R.id.ticket_widget_empty,if(favorites) "掲載中のお気に入りはありません。\nタップしてアプリで登録・更新" else "公演情報がありません。\nタップしてアプリで更新")
      views.setTextViewText(R.id.ticket_widget_updated,snapshot.optString("updatedShort",snapshot.optString("updatedLabel","アプリを開いて更新").substringBefore(" · ")))
      manager.updateAppWidget(id,views)
    }
  }
}
class UpcomingShowsWidgetProvider : FavoriteShowsWidgetProvider() {
  override val favoritesOnly = false
}
