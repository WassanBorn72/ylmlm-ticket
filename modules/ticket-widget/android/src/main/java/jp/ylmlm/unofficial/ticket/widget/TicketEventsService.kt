package jp.ylmlm.unofficial.ticket.widget

import android.content.Context
import android.content.Intent
import android.widget.RemoteViews
import android.widget.RemoteViewsService
import android.view.View
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

class TicketEventsService : RemoteViewsService() {
  override fun onGetViewFactory(intent: Intent): RemoteViewsFactory = TicketEventsFactory(applicationContext,intent.getBooleanExtra("favorites",false))
}
internal class TicketEventsFactory(private val context: Context,private val favorites: Boolean) : RemoteViewsService.RemoteViewsFactory {
  private var rowLayout=R.layout.ticket_widget_event_basic
  private var events: List<JSONObject> = emptyList()
  override fun onCreate() { onDataSetChanged() }
  override fun onDataSetChanged() {
    val today=format("yyyy-MM-dd",Date())
    val input=snapshot(context).optJSONArray("events")
    events=(0 until (input?.length() ?: 0)).mapNotNull{input?.optJSONObject(it)}
      .filter{it.optString("date") >= today && (!favorites || it.optBoolean("favorite"))}
      .distinctBy{it.optString("id")}
      .sortedWith(compareBy({it.optString("date")},{it.optString("sortTime")},{it.optString("id")}))
    rowLayout=when {
      events.any{it.optString("performanceLabel").isNotBlank() || it.optString("meetAndGreetLabel").isNotBlank()} -> R.layout.ticket_widget_event
      events.any{(it.optJSONArray("ticketOffers")?.length() ?: 0)>0} -> R.layout.ticket_widget_event_sites
      else -> R.layout.ticket_widget_event_basic
    }
  }
  override fun onDestroy() { events=emptyList() }
  override fun getCount()=events.size
  override fun getViewTypeCount()=3
  override fun hasStableIds()=true
  override fun getItemId(position: Int): Long {
    // FNV-1a provides a stable 64-bit ID; Java String.hashCode collisions must
    // not cause the launcher to reuse a different event's row or click target.
    var hash=-3750763034362895579L
    for(byte in events.getOrNull(position)?.optString("id").orEmpty().toByteArray(Charsets.UTF_8)) hash=(hash xor (byte.toLong() and 255))*1099511628211L
    return hash
  }
  override fun getLoadingView(): RemoteViews?=null
  override fun getViewAt(position: Int): RemoteViews? {
    val event=events.getOrNull(position) ?: return null
    val view=RemoteViews(context.packageName,rowLayout)
    // Large sp dimensions scale differently from small text on Android 14's
    // nonlinear font scaling. Use a shared dp minimum scaled by fontScale, while
    // keeping natural content height as a safety net. The launcher lays out rows.
    val cardDp=if(rowLayout == R.layout.ticket_widget_event) 88 else 72
    val minimum=(cardDp*context.resources.displayMetrics.density*maxOf(1f,context.resources.configuration.fontScale)).toInt()
    view.setInt(R.id.ticket_row,"setMinimumHeight",minimum)
    view.setTextViewText(R.id.ticket_title,event.optString("title"))
    val summary=event.optString("summary")
    val time=event.optString("timeLabel",summary.substringBefore(" · ").substringAfter(" ","時間未掲載"))
    val venue=event.optString("venueLabel",summary.substringAfter(" · ","会場はアプリで確認"))
    view.setTextViewText(R.id.ticket_open,time)
    view.setTextViewText(R.id.ticket_meta,venue)
    val day=try{SimpleDateFormat("yyyy-MM-dd",Locale.JAPAN).apply{timeZone=TimeZone.getTimeZone("Asia/Tokyo");isLenient=false}.parse(event.optString("date"))}catch(_:Exception){null}
    view.setTextViewText(R.id.ticket_month,day?.let{format("M月 EEE",it)} ?: "--月")
    view.setTextViewText(R.id.ticket_day,day?.let{format("d",it)} ?: "--")
    view.setViewVisibility(R.id.ticket_weekday,View.GONE)
    val offers=event.optJSONArray("ticketOffers")
    val sites=(0 until (offers?.length() ?: 0)).mapNotNull{offers?.optJSONObject(it)}.filter{it.optString("sourceName").isNotBlank()}.distinctBy{it.optString("sourceId")}.sortedBy{it.optString("sourceName")}
    view.setViewVisibility(R.id.ticket_badges,if(sites.isEmpty()) View.GONE else View.VISIBLE)
    sites.firstOrNull()?.let {
      view.setTextViewText(R.id.ticket_site,it.optString("sourceName"))
      val (bg,fg)=when(it.optString("sourceId")) {
        "ticketdive" -> R.drawable.ticket_tag_site_ticketdive to "#17643B"
        "livepocket" -> R.drawable.ticket_tag_site_livepocket to "#855700"
        "tiget" -> R.drawable.ticket_tag_site_tiget to "#623996"
        "eplus" -> R.drawable.ticket_tag_site_eplus to "#9F2943"
        else -> R.drawable.ticket_tag_site_other to "#4B5C6B"
      }
      view.setInt(R.id.ticket_site,"setBackgroundResource",bg);view.setTextColor(R.id.ticket_site,android.graphics.Color.parseColor(fg))
    }
    view.setViewVisibility(R.id.ticket_more,if(sites.size > 1) View.VISIBLE else View.GONE)
    view.setTextViewText(R.id.ticket_more,"＋${sites.size-1}")
    val performance=event.optString("performanceLabel");val meet=event.optString("meetAndGreetLabel")
    view.setViewVisibility(R.id.ticket_timing_group,if(performance.isNotBlank() || meet.isNotBlank()) View.VISIBLE else View.GONE)
    view.setTextViewText(R.id.ticket_performance,performance);view.setTextViewText(R.id.ticket_meet,meet)
    view.setViewVisibility(R.id.ticket_performance,if(performance.isNotBlank()) View.VISIBLE else View.GONE)
    view.setViewVisibility(R.id.ticket_meet,if(meet.isNotBlank()) View.VISIBLE else View.GONE)
    view.setContentDescription(R.id.ticket_row,listOf(event.optString("title"),time,venue,sites.joinToString(" / "){it.optString("sourceName")},performance,meet).filter{it.isNotBlank()}.joinToString(" "))
    view.setOnClickFillInIntent(R.id.ticket_row,click(event,false))
    val query=event.optString("mapQuery").ifBlank{if(venue in listOf("会場は購入先で確認","会場はアプリで確認")) "" else venue}
    view.setBoolean(R.id.ticket_meta,"setEnabled",query.isNotBlank())
    view.setOnClickFillInIntent(R.id.ticket_meta,if(query.isNotBlank()) click(event,true).putExtra("mapQuery",query) else click(event,false))
    return view
  }
  companion object {
    internal fun snapshot(context: Context): JSONObject=try{JSONObject(context.getSharedPreferences("ticket_widget",0).getString("snapshot","{}") ?: "{}")}catch(_:Exception){JSONObject()}
    private fun format(pattern: String,date: Date)=SimpleDateFormat(pattern,Locale.JAPAN).apply{timeZone=TimeZone.getTimeZone("Asia/Tokyo")}.format(date)
    internal fun click(event: JSONObject,map: Boolean)=Intent().putExtra("eventId",event.optString("id")).putExtra("date",event.optString("date")).putExtra("title",event.optString("title")).putExtra("url",event.optString("eventUrl")).putExtra("map",map)
  }
}
