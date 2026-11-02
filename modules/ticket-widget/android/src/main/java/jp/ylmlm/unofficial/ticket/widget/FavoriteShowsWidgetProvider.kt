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
import android.util.SizeF
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
    // Measure the same Android layout that the launcher receives, including font scale,
    // title wrapping, date badges, margins and footer, instead of guessing dp per row.
    internal fun fitRows(view: View, rowIds: IntArray, width: Int, height: Int, candidates: Int): Int {
      val count = candidates.coerceIn(0,rowIds.size)
      if(count == 0) return 0
      for(limit in count downTo 1) {
        rowIds.forEachIndexed { index,row -> view.findViewById<View>(row).visibility = if(index < limit) View.VISIBLE else View.GONE }
        fun invalidateMeasurements(node: View) {
          node.forceLayout()
          if(node is android.view.ViewGroup) for(i in 0 until node.childCount) invalidateMeasurements(node.getChildAt(i))
        }
        invalidateMeasurements(view)
        view.measure(View.MeasureSpec.makeMeasureSpec(width,View.MeasureSpec.EXACTLY),View.MeasureSpec.makeMeasureSpec(0,View.MeasureSpec.UNSPECIFIED))
        if(view.measuredHeight <= height || limit == 1) return limit
      }
      return 1
    }
    internal fun fitLayout(view: View, rows: IntArray, titles: IntArray, width: Int, height: Int, candidates: Int): Pair<Int,Int> {
      titles.forEach { view.findViewById<android.widget.TextView>(it).maxLines = 2 }
      val fullCount = fitRows(view,rows,width,height,candidates)
      titles.forEach { view.findViewById<android.widget.TextView>(it).maxLines = 1 }
      val denseCount = fitRows(view,rows,width,height,candidates)
      val count = maxOf(fullCount,denseCount)
      val lines = if(denseCount > fullCount) 1 else 2
      titles.forEach { view.findViewById<android.widget.TextView>(it).maxLines = lines }
      rows.forEachIndexed { index,row -> view.findViewById<View>(row).visibility = if(index < count) View.VISIBLE else View.GONE }
      return count to lines
    }
    private fun render(context: Context, manager: AppWidgetManager, id: Int, favorites: Boolean, options: Bundle? = null) {
      val snapshot = try { JSONObject(context.getSharedPreferences("ticket_widget", 0).getString("snapshot", "{}") ?: "{}") } catch (_: Exception) { JSONObject() }
      val today = SimpleDateFormat("yyyy-MM-dd", Locale.JAPAN).apply { timeZone = TimeZone.getTimeZone("Asia/Tokyo") }.format(Date())
      val input = snapshot.optJSONArray("events")
      val events = (0 until (input?.length() ?: 0)).mapNotNull { input?.optJSONObject(it) }.filter { it.optString("date") >= today && (!favorites || it.optBoolean("favorite")) }.sortedWith(compareBy({it.optString("date")}, {it.optString("sortTime")}, {it.optString("id")}))
      val size = options ?: manager.getAppWidgetOptions(id)
      val minHeight = size.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT,180)
      val minWidth = size.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH,300)
      val maxHeight = size.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT,minHeight)
      val maxWidth = size.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_WIDTH,minWidth)
      fun layout(height: Int,width: Int): RemoteViews {
      val views = RemoteViews(context.packageName, R.layout.ticket_widget)
      val density = context.resources.displayMetrics.density
      val padding = (4 * density).toInt()
      views.setViewPadding(R.id.ticket_widget_root,padding,padding,padding,padding)
      views.setViewVisibility(R.id.ticket_widget_heading,View.GONE)
      views.setTextViewText(R.id.ticket_widget_mode, if(favorites) {if(width<260) "お気に入り" else "お気に入りの公演"} else "直近の公演")
      val overview = open(context,id,9,if(favorites) "favorites" else "tickets")
      overview?.let { views.setOnClickPendingIntent(R.id.ticket_widget_root,it);views.setOnClickPendingIntent(R.id.ticket_widget_footer,it) }
      val rows = intArrayOf(R.id.ticket_row_0,R.id.ticket_row_1,R.id.ticket_row_2,R.id.ticket_row_3,R.id.ticket_row_4,R.id.ticket_row_5)
      val titles = intArrayOf(R.id.ticket_title_0,R.id.ticket_title_1,R.id.ticket_title_2,R.id.ticket_title_3,R.id.ticket_title_4,R.id.ticket_title_5)
      val times = intArrayOf(R.id.ticket_time_0,R.id.ticket_time_1,R.id.ticket_time_2,R.id.ticket_time_3,R.id.ticket_time_4,R.id.ticket_time_5)
      val metas = intArrayOf(R.id.ticket_meta_0,R.id.ticket_meta_1,R.id.ticket_meta_2,R.id.ticket_meta_3,R.id.ticket_meta_4,R.id.ticket_meta_5)
      val months = intArrayOf(R.id.ticket_month_0,R.id.ticket_month_1,R.id.ticket_month_2,R.id.ticket_month_3,R.id.ticket_month_4,R.id.ticket_month_5)
      val days = intArrayOf(R.id.ticket_day_0,R.id.ticket_day_1,R.id.ticket_day_2,R.id.ticket_day_3,R.id.ticket_day_4,R.id.ticket_day_5)
      val weekdays = intArrayOf(R.id.ticket_weekday_0,R.id.ticket_weekday_1,R.id.ticket_weekday_2,R.id.ticket_weekday_3,R.id.ticket_weekday_4,R.id.ticket_weekday_5)
      rows.forEachIndexed { index,row ->
        val event = events.getOrNull(index)
        if(event == null) views.setViewVisibility(row,View.GONE)
        else {
          views.setViewVisibility(row,View.VISIBLE)
          views.setTextViewText(titles[index],event.optString("title"))
          views.setInt(titles[index],"setMaxLines",2)
          val summary = event.optString("summary")
          views.setTextViewText(times[index],event.optString("timeLabel",summary.substringBefore(" · ").substringAfter(" ","時間未掲載")))
          views.setTextViewText(metas[index],event.optString("venueLabel",summary.substringAfter(" · ","会場はアプリで確認")))
          val day = try { SimpleDateFormat("yyyy-MM-dd",Locale.JAPAN).apply{timeZone=TimeZone.getTimeZone("Asia/Tokyo");isLenient=false}.parse(event.optString("date")) } catch (_:Exception){null}
          if(day!=null){
            fun label(pattern:String)=SimpleDateFormat(pattern,Locale.JAPAN).apply{timeZone=TimeZone.getTimeZone("Asia/Tokyo")}.format(day)
            views.setTextViewText(months[index],label("M月 EEE"))
            views.setTextViewText(days[index],label("d"))
            val weekday=label("EEE")
            views.setTextViewText(weekdays[index],weekday)
            views.setTextColor(months[index],android.graphics.Color.parseColor(if(weekday=="日") "#B34C58" else if(weekday=="土") "#416EA2" else "#287B59"))
          }else{views.setTextViewText(months[index],"--月");views.setTextViewText(days[index],"--")}
          views.setViewVisibility(weekdays[index],View.GONE)
          views.setContentDescription(row,event.optString("title") + " " + event.optString("summary"))
          open(context,id,index,"event/"+Uri.encode(event.optString("id")))?.let { views.setOnClickPendingIntent(row,it) }
        }
      }
      views.setViewVisibility(R.id.ticket_widget_empty,if(events.isEmpty()) View.VISIBLE else View.GONE)
      views.setTextViewText(R.id.ticket_widget_empty,if(favorites) "掲載中のお気に入りはありません。\nタップしてアプリで登録・更新" else "公演情報がありません。\nタップしてアプリで更新")
      views.setTextViewText(R.id.ticket_widget_updated,snapshot.optString("updatedShort",snapshot.optString("updatedLabel","アプリを開いて更新").substringBefore(" · ")))
      val measured = views.apply(context,null)
      val widthPx = (width * density).toInt()
      val heightPx = (height * density).toInt()
      val (limit,titleLines) = fitLayout(measured,rows,titles,widthPx,heightPx,events.size)
      titles.forEach { views.setInt(it,"setMaxLines",titleLines) }
      rows.forEachIndexed { index,row -> views.setViewVisibility(row,if(index < limit) View.VISIBLE else View.GONE) }
      return views
      }
      // Modern launchers report the actual supported sizes. Their content bounds may
      // differ from the legacy min/max pair (foldables, grid spacing and resize modes).
      // Give the host a layout for each actual size instead of inferring its height.
      if(Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        @Suppress("DEPRECATION")
        val sizes = size.getParcelableArrayList<SizeF>(AppWidgetManager.OPTION_APPWIDGET_SIZES)
          ?.filter { it.width.isFinite() && it.height.isFinite() && it.width > 0 && it.height > 0 }
          ?.distinct().orEmpty()
        if(sizes.isNotEmpty() && sizes.size <= 16) {
          manager.updateAppWidget(id,RemoteViews(sizes.associateWith { layout(it.height.toInt(),it.width.toInt()) }))
          return
        }
      }
      // Older launchers only supply orientation bounds: portrait is min width / max
      // height. Keep both layouts so rotation does not require a network refresh.
      manager.updateAppWidget(id,RemoteViews(layout(minHeight,maxWidth),layout(maxHeight,minWidth)))
    }
  }
}
class UpcomingShowsWidgetProvider : FavoriteShowsWidgetProvider() {
  override val favoritesOnly = false
}
