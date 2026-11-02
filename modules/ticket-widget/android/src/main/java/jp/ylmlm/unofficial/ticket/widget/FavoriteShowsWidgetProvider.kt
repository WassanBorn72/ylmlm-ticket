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
    private data class WidgetSite(val sourceId: String,val name: String)
    private fun ticketSites(input: org.json.JSONArray?): List<WidgetSite> =
      (0 until (input?.length() ?: 0)).mapNotNull { input?.optJSONObject(it) }
        .map { WidgetSite(it.optString("sourceId"),it.optString("sourceName",it.optString("sourceId"))) }
        .filter { it.name.isNotBlank() }.distinctBy { it.sourceId.ifBlank { it.name } }.sortedBy { it.name }
    private fun siteStyle(site: WidgetSite): Pair<Int,String> = when {
      site.sourceId == "ticketdive" || site.name == "TicketDive" -> R.drawable.ticket_tag_site_ticketdive to "#17643B"
      site.sourceId == "livepocket" || site.name == "LivePocket" -> R.drawable.ticket_tag_site_livepocket to "#855700"
      site.sourceId == "tiget" || site.name == "TIGET" -> R.drawable.ticket_tag_site_tiget to "#623996"
      site.sourceId == "eplus" || site.name == "イープラス" -> R.drawable.ticket_tag_site_eplus to "#9F2943"
      else -> R.drawable.ticket_tag_site_other to "#4B5C6B"
    }
    private fun measure(view: View,width: Int) {
      fun invalidate(node: View) {
        node.forceLayout()
        if(node is android.view.ViewGroup) for(i in 0 until node.childCount) invalidate(node.getChildAt(i))
      }
      invalidate(view)
      view.measure(View.MeasureSpec.makeMeasureSpec(width,View.MeasureSpec.EXACTLY),View.MeasureSpec.makeMeasureSpec(0,View.MeasureSpec.UNSPECIFIED))
    }
    // All visible cards use the tallest card's natural height. Measure the complete
    // uniform group when choosing a count so equal heights never push out the footer.
    private fun measureUniformRows(view: View,rows: IntArray,width: Int,count: Int): Int {
      rows.forEachIndexed { index,row ->
        view.findViewById<View>(row).apply {
          visibility = if(index < count) View.VISIBLE else View.GONE
          minimumHeight = 0
          layoutParams = layoutParams.apply { height = android.view.ViewGroup.LayoutParams.WRAP_CONTENT }
        }
      }
      // A MATCH_PARENT column is excluded from a horizontal LinearLayout's
      // wrap-content height. Measure its real content first, then restore filling.
      val fillChildren = rows.flatMap { row ->
        val parent = view.findViewById<android.view.ViewGroup>(row)
        (0 until parent.childCount).map { parent.getChildAt(it) }
      }.filter { it.layoutParams.height == android.view.ViewGroup.LayoutParams.MATCH_PARENT }
      fillChildren.forEach { child ->
        val params = child.layoutParams
        params.height = android.view.ViewGroup.LayoutParams.WRAP_CONTENT
        child.layoutParams = params
      }
      measure(view,width)
      val cardHeight = rows.take(count).maxOfOrNull { view.findViewById<View>(it).measuredHeight } ?: 0
      fillChildren.forEach { child ->
        val params = child.layoutParams
        params.height = android.view.ViewGroup.LayoutParams.MATCH_PARENT
        child.layoutParams = params
      }
      rows.take(count).forEach { row ->
        view.findViewById<View>(row).apply { layoutParams = layoutParams.apply { height = cardHeight } }
      }
      measure(view,width)
      return view.measuredHeight
    }
    internal fun fitRows(view: View, rowIds: IntArray, width: Int, height: Int, candidates: Int): Int {
      val count = candidates.coerceIn(0,rowIds.size)
      if(count == 0) return 0
      for(limit in count downTo 1) {
        if(measureUniformRows(view,rowIds,width,limit) <= height) return limit
      }
      return 0
    }
    internal fun fitLayout(view: View, rows: IntArray, titles: IntArray, width: Int, height: Int, candidates: Int): Pair<Int,Int> {
      titles.forEach { view.findViewById<android.widget.TextView>(it).maxLines = 2 }
      val fullCount = fitRows(view,rows,width,height,candidates)
      titles.forEach { view.findViewById<android.widget.TextView>(it).maxLines = 1 }
      val denseCount = fitRows(view,rows,width,height,candidates)
      val count = maxOf(fullCount,denseCount).coerceAtLeast(if(candidates > 0) 1 else 0)
      val lines = if(denseCount > fullCount || fullCount == 0) 1 else 2
      titles.forEach { view.findViewById<android.widget.TextView>(it).maxLines = lines }
      measureUniformRows(view,rows,width,count)
      // Keep a compact panel at the top. Excess host height must not enlarge
      // cards or separate a title from its venue and timetable.
      return count to lines
    }
    private fun render(context: Context, manager: AppWidgetManager, id: Int, favorites: Boolean, options: Bundle? = null) {
      val snapshot = try { JSONObject(context.getSharedPreferences("ticket_widget", 0).getString("snapshot", "{}") ?: "{}") } catch (_: Exception) { JSONObject() }
      val today = SimpleDateFormat("yyyy-MM-dd", Locale.JAPAN).apply { timeZone = TimeZone.getTimeZone("Asia/Tokyo") }.format(Date())
      val input = snapshot.optJSONArray("events")
      val events = (0 until (input?.length() ?: 0)).mapNotNull { input?.optJSONObject(it) }.filter { it.optString("date") >= today && (!favorites || it.optBoolean("favorite")) }.sortedWith(compareBy({it.optString("date")}, {it.optString("sortTime")}, {it.optString("id")}))
      val size = options ?: manager.getAppWidgetOptions(id)
      val minHeight = size.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT,120)
      val minWidth = size.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH,300)
      val maxHeight = size.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT,minHeight)
      val maxWidth = size.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_WIDTH,minWidth)
      fun layout(height: Float,width: Float): RemoteViews {
      val views = RemoteViews(context.packageName, R.layout.ticket_widget_sized)
      val density = context.resources.displayMetrics.density
      val padding = 0
      views.setViewPadding(R.id.ticket_widget_root,padding,padding,padding,padding)
      views.setViewVisibility(R.id.ticket_widget_heading,View.VISIBLE)
      // A short widget keeps the app name and moves its mode into the footer link.
      val mini = height / context.resources.configuration.fontScale < 160
      val compactHeader = height / context.resources.configuration.fontScale <= 300
      views.setViewVisibility(R.id.ticket_widget_mode,if(compactHeader) View.GONE else View.VISIBLE)
      val side = (12*density).toInt()
      val headInset = ((if(compactHeader) 1 else 3)*density).toInt()
      val footInset = ((if(compactHeader) 1 else 2)*density).toInt()
      views.setViewPadding(R.id.ticket_widget_header,side,headInset,side,headInset)
      views.setInt(R.id.ticket_widget_header,"setMinimumHeight",((if(mini) 24 else if(compactHeader) 28 else 44)*density).toInt())
      views.setViewPadding(R.id.ticket_widget_footer,side,footInset,side,footInset)
      views.setInt(R.id.ticket_widget_footer,"setMinimumHeight",((if(mini) 20 else if(compactHeader) 24 else 28)*density).toInt())
      views.setTextViewText(R.id.ticket_widget_list,if(compactHeader) {if(favorites) "お気に入り ›" else "直近の公演 ›"} else "公演一覧 ›")
      views.setTextViewTextSize(R.id.ticket_widget_heading,android.util.TypedValue.COMPLEX_UNIT_SP,if(mini) 14f else 16f)
      views.setTextViewTextSize(R.id.ticket_widget_updated,android.util.TypedValue.COMPLEX_UNIT_SP,if(mini) 11f else 13f)
      views.setTextViewTextSize(R.id.ticket_widget_list,android.util.TypedValue.COMPLEX_UNIT_SP,if(mini) 12f else 14f)
      views.setViewVisibility(R.id.ticket_widget_top_space,View.GONE)
      views.setViewVisibility(R.id.ticket_widget_bottom_space,View.GONE)
      views.setTextViewText(R.id.ticket_widget_mode, if(favorites) {if(width<260) "お気に入り" else "お気に入りの公演"} else "直近の公演")
      val overview = open(context,id,9,if(favorites) "favorites" else "tickets")
      overview?.let { views.setOnClickPendingIntent(R.id.ticket_widget_root,it);views.setOnClickPendingIntent(R.id.ticket_widget_header,it);views.setOnClickPendingIntent(R.id.ticket_widget_footer,it) }
      val rows = intArrayOf(R.id.ticket_row_0,R.id.ticket_row_1,R.id.ticket_row_2,R.id.ticket_row_3,R.id.ticket_row_4,R.id.ticket_row_5)
      val titles = intArrayOf(R.id.ticket_title_0,R.id.ticket_title_1,R.id.ticket_title_2,R.id.ticket_title_3,R.id.ticket_title_4,R.id.ticket_title_5)
      val sites = intArrayOf(R.id.ticket_site_0,R.id.ticket_site_1,R.id.ticket_site_2,R.id.ticket_site_3,R.id.ticket_site_4,R.id.ticket_site_5)
      val badgeRows = intArrayOf(R.id.ticket_badges_0,R.id.ticket_badges_1,R.id.ticket_badges_2,R.id.ticket_badges_3,R.id.ticket_badges_4,R.id.ticket_badges_5)
      val moreSites = intArrayOf(R.id.ticket_more_0,R.id.ticket_more_1,R.id.ticket_more_2,R.id.ticket_more_3,R.id.ticket_more_4,R.id.ticket_more_5)
      val performances = intArrayOf(R.id.ticket_performance_0,R.id.ticket_performance_1,R.id.ticket_performance_2,R.id.ticket_performance_3,R.id.ticket_performance_4,R.id.ticket_performance_5)
      val meets = intArrayOf(R.id.ticket_meet_0,R.id.ticket_meet_1,R.id.ticket_meet_2,R.id.ticket_meet_3,R.id.ticket_meet_4,R.id.ticket_meet_5)
      val opens = intArrayOf(R.id.ticket_open_0,R.id.ticket_open_1,R.id.ticket_open_2,R.id.ticket_open_3,R.id.ticket_open_4,R.id.ticket_open_5)
      val timingGroups = intArrayOf(R.id.ticket_timing_group_0,R.id.ticket_timing_group_1,R.id.ticket_timing_group_2,R.id.ticket_timing_group_3,R.id.ticket_timing_group_4,R.id.ticket_timing_group_5)
      val metas = intArrayOf(R.id.ticket_meta_0,R.id.ticket_meta_1,R.id.ticket_meta_2,R.id.ticket_meta_3,R.id.ticket_meta_4,R.id.ticket_meta_5)
      val months = intArrayOf(R.id.ticket_month_0,R.id.ticket_month_1,R.id.ticket_month_2,R.id.ticket_month_3,R.id.ticket_month_4,R.id.ticket_month_5)
      val days = intArrayOf(R.id.ticket_day_0,R.id.ticket_day_1,R.id.ticket_day_2,R.id.ticket_day_3,R.id.ticket_day_4,R.id.ticket_day_5)
      val weekdays = intArrayOf(R.id.ticket_weekday_0,R.id.ticket_weekday_1,R.id.ticket_weekday_2,R.id.ticket_weekday_3,R.id.ticket_weekday_4,R.id.ticket_weekday_5)
      rows.forEachIndexed { index,row ->
        val inset = ((if(compactHeader) 2 else 4)*density).toInt()
        views.setViewPadding(row,inset,inset,inset,inset)
        val tagSide = (5*density).toInt()
        val tagInset = ((if(compactHeader) 0 else 1)*density).toInt()
        views.setViewPadding(sites[index],tagSide,tagInset,tagSide,tagInset)
        views.setViewPadding(timingGroups[index],tagSide,tagInset,tagSide,tagInset)
        val event = events.getOrNull(index)
        if(event == null) views.setViewVisibility(row,View.GONE)
        else {
          views.setViewVisibility(row,View.VISIBLE)
          views.setTextViewText(titles[index],event.optString("title"))
          views.setInt(titles[index],"setMaxLines",2)
          val summary = event.optString("summary")
          val time = event.optString("timeLabel",summary.substringBefore(" · ").substringAfter(" ","時間未掲載"))
          val venue = event.optString("venueLabel",summary.substringAfter(" · ","会場はアプリで確認"))
          views.setTextViewText(metas[index],venue)
          val query = event.optString("mapQuery").ifBlank { if(venue == "会場は購入先で確認" || venue == "会場はアプリで確認") "" else venue }
          views.setOnClickPendingIntent(metas[index],null)
          views.setBoolean(metas[index],"setEnabled",query.isNotBlank())
          if(query.isNotBlank()) {
            val mapIntent = Intent(Intent.ACTION_VIEW,Uri.parse("https://www.google.com/maps/search/?api=1&query="+Uri.encode(query))).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            val map = PendingIntent.getActivity(context,id*10+index,mapIntent,PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
            views.setOnClickPendingIntent(metas[index],map)
            views.setContentDescription(metas[index],"$venue をGoogleマップで開く")
          }
          views.setTextViewText(opens[index],time)
          val grouped = ticketSites(event.optJSONArray("ticketOffers"))
          val sourceNames = grouped.joinToString(" / ") { it.name }
          val primary = grouped.firstOrNull()
          views.setViewVisibility(badgeRows[index],if(primary == null || mini) View.GONE else View.VISIBLE)
          if(primary != null) {
            views.setTextViewText(sites[index],primary.name)
            views.setTextViewText(moreSites[index],"＋${grouped.size-1}")
            views.setViewVisibility(moreSites[index],if(grouped.size > 1 && width >= 280) View.VISIBLE else View.GONE)
            val (siteBg,siteFg) = siteStyle(primary)
            views.setInt(sites[index],"setBackgroundResource",siteBg)
            views.setTextColor(sites[index],android.graphics.Color.parseColor(siteFg))
          }
          val performance = event.optString("performanceLabel")
          val meet = event.optString("meetAndGreetLabel")
          val hasTiming = !mini && (performance.isNotBlank() || meet.isNotBlank())
          views.setViewVisibility(timingGroups[index],if(hasTiming) View.VISIBLE else View.GONE)
          views.setTextViewText(performances[index],performance)
          views.setViewVisibility(performances[index],if(performance.isBlank()) View.GONE else View.VISIBLE)
          views.setTextViewText(meets[index],meet)
          views.setViewVisibility(meets[index],if(meet.isBlank()) View.GONE else View.VISIBLE)
          val day = try { SimpleDateFormat("yyyy-MM-dd",Locale.JAPAN).apply{timeZone=TimeZone.getTimeZone("Asia/Tokyo");isLenient=false}.parse(event.optString("date")) } catch (_:Exception){null}
          if(day!=null){
            fun label(pattern:String)=SimpleDateFormat(pattern,Locale.JAPAN).apply{timeZone=TimeZone.getTimeZone("Asia/Tokyo")}.format(day)
            views.setTextViewText(months[index],label("M月 EEE"))
            views.setTextViewText(days[index],label("d"))
            val weekday=label("EEE")
            views.setTextViewText(weekdays[index],weekday)
            views.setTextColor(months[index],android.graphics.Color.parseColor(if(weekday=="日") "#B34C58" else if(weekday=="土") "#416EA2" else "#52616D"))
          }else{views.setTextViewText(months[index],"--月");views.setTextViewText(days[index],"--")}
          views.setViewVisibility(weekdays[index],View.GONE)
          views.setContentDescription(row,listOf(event.optString("title"),summary,sourceNames,performance,meet).filter{it.isNotBlank()}.joinToString(" "))
          open(context,id,index,"event/"+Uri.encode(event.optString("id")))?.let { views.setOnClickPendingIntent(row,it) }
        }
      }
      views.setViewVisibility(R.id.ticket_widget_empty,if(events.isEmpty()) View.VISIBLE else View.GONE)
      views.setViewPadding(R.id.ticket_widget_empty,((if(mini) 12 else 14)*density).toInt(),((if(mini) 2 else 14)*density).toInt(),((if(mini) 12 else 14)*density).toInt(),((if(mini) 2 else 14)*density).toInt())
      views.setInt(R.id.ticket_widget_empty,"setMinimumHeight",(if(mini) 0 else (56*density).toInt()))
      views.setTextViewTextSize(R.id.ticket_widget_empty,android.util.TypedValue.COMPLEX_UNIT_SP,if(mini) 12f else 14f)
      views.setTextViewText(R.id.ticket_widget_empty,if(mini) {if(favorites) "アプリでお気に入りを登録" else "アプリで公演情報を更新"} else if(favorites) "掲載中のお気に入りはありません。\nタップしてアプリで登録・更新" else "公演情報がありません。\nタップしてアプリで更新")
      views.setTextViewText(R.id.ticket_widget_updated,snapshot.optString("updatedShort",snapshot.optString("updatedLabel","アプリを開いて更新").substringBefore(" · ")))
      val measured = views.apply(context,null)
      // Keep the source tag and extra-source count inside the text column.
      val columnWidth = ((width-78).coerceAtLeast(1f)*density).toInt()
      sites.forEachIndexed { index,id ->
        val source = measured.findViewById<android.widget.TextView>(id)
        val more = measured.findViewById<android.widget.TextView>(moreSites[index])
        val extra = if(more.visibility == View.VISIBLE) more.paint.measureText(more.text.toString()).toInt()+(4*density).toInt() else 0
        val sourceLimit = (columnWidth-extra).coerceAtLeast(1)
        source.maxWidth = sourceLimit
        views.setInt(id,"setMaxWidth",sourceLimit)
      }
      val widthPx = (width * density).toInt()
      val heightPx = (height * density).toInt()
      val (fittedCount,titleLines) = fitLayout(measured,rows,titles,widthPx,heightPx,events.size)
      titles.forEach { views.setInt(it,"setMaxLines",titleLines) }
      val fits = measured.measuredHeight <= heightPx
      val limit = if(fits) fittedCount else 0
      if(!fits) {
        views.setViewVisibility(R.id.ticket_widget_empty,View.VISIBLE)
        views.setTextViewText(R.id.ticket_widget_empty,"サイズを広げて表示")
        views.setInt(R.id.ticket_widget_empty,"setMinimumHeight",0)
        views.setViewPadding(R.id.ticket_widget_empty,(8*density).toInt(),(2*density).toInt(),(8*density).toInt(),(2*density).toInt())
        views.setTextViewTextSize(R.id.ticket_widget_empty,android.util.TypedValue.COMPLEX_UNIT_SP,12f)
      }
      val cardHeight = if(limit > 0) measured.findViewById<View>(rows[0]).measuredHeight else 0
      rows.forEachIndexed { index,row ->
        views.setViewVisibility(row,if(index < limit) View.VISIBLE else View.GONE)
        views.setInt(row,"setMinimumHeight",cardHeight)
      }
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
          manager.updateAppWidget(id,RemoteViews(sizes.associateWith { layout(it.height,it.width) }))
          return
        }
      }
      // Older launchers only supply orientation bounds: portrait is min width / max
      // height. Keep both layouts so rotation does not require a network refresh.
      manager.updateAppWidget(id,RemoteViews(layout(minHeight.toFloat(),maxWidth.toFloat()),layout(maxHeight.toFloat(),minWidth.toFloat())))
    }
  }
}
class UpcomingShowsWidgetProvider : FavoriteShowsWidgetProvider() {
  override val favoritesOnly = false
}
