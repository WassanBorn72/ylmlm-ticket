package jp.ylmlm.unofficial.ticket.widget

import android.appwidget.AppWidgetManager
import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.view.View
import android.view.ViewGroup
import android.widget.BaseAdapter
import android.widget.ListView
import android.widget.RemoteViews
import android.widget.TextView
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@org.robolectric.annotation.GraphicsMode(org.robolectric.annotation.GraphicsMode.Mode.NATIVE)
@Config(sdk=[34],qualifiers="mdpi")
class TicketWidgetTest {
  private lateinit var context: Context
  @Before fun prepare() {context=RuntimeEnvironment.getApplication();context.getSharedPreferences("ticket_widget",0).edit().clear().commit()}
  private fun save(count: Int=30,times: Boolean=true,sites: Boolean=true) {
    val events=JSONArray()
    for(i in 0 until count) events.put(JSONObject().put("id","event-$i").put("title",if(i%2 == 0) "ゆるめるモ！のライブイベント・スペシャルステージ" else "公演${i+1}")
      .put("date","2099-02-01").put("sortTime","%02d:%02d".format(i/60,i%60)).put("favorite",i%2 == 0)
      .put("timeLabel","OPEN 18:00 / START 18:30").put("venueLabel","渋谷ライブホール（表示例）").put("mapQuery","渋谷ライブホール 東京都渋谷区")
      .put("eventUrl","https://tiget.net/events/${500000+i}")
      .put("performanceLabel",if(times && i%2 == 0) "出演 19:00〜19:25" else "")
      .put("meetAndGreetLabel",if(times && i%2 == 0) "特典会 19:35〜20:25" else "")
      .put("ticketOffers",if(sites && i%2 == 0) JSONArray("""[{"sourceId":"livepocket","sourceName":"LivePocket"},{"sourceId":"tiget","sourceName":"TIGET"}]""") else JSONArray()))
    events.put(JSONObject().put("id","past").put("date","2000-01-01").put("favorite",true))
    context.getSharedPreferences("ticket_widget",0).edit().putString("snapshot",JSONObject().put("events",events).put("updatedShort","11/3 18:00取得").toString()).commit()
  }
  private fun factory(favorites: Boolean=false)=TicketEventsFactory(context,favorites).apply{onCreate()}
  private fun row(factory: TicketEventsFactory,index: Int=0): View=factory.getViewAt(index)!!.apply(context,null)
  private fun previewFont(view: View) {
    val path=System.getenv("WIDGET_PREVIEW_FONT") ?: return
    val font=android.graphics.Typeface.createFromFile(path)
    fun apply(node: View) {
      if(node is TextView) node.typeface=android.graphics.Typeface.create(font,node.typeface?.style ?: 0)
      if(node is ViewGroup) for(i in 0 until node.childCount) apply(node.getChildAt(i))
    }
    apply(view)
  }
  private fun measure(view: View,width: Int,height: Int) {
    view.measure(View.MeasureSpec.makeMeasureSpec(width,View.MeasureSpec.EXACTLY),View.MeasureSpec.makeMeasureSpec(height,View.MeasureSpec.EXACTLY));view.layout(0,0,width,height)
  }
  // Render the factory's actual RemoteViews in a real ListView. Do not invoke
  // an app-side fitting function or modify row heights before making assertions.
  private fun host(factory: TicketEventsFactory,widthDp: Int,heightDp: Int): View {
    val manager=AppWidgetManager.getInstance(context);val shadow=shadowOf(manager)
    val id=shadow.createWidget(UpcomingShowsWidgetProvider::class.java,R.layout.ticket_widget_list)
    UpcomingShowsWidgetProvider().onAppWidgetOptionsChanged(context,manager,id,Bundle().apply{putInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT,120)})
    val view=shadow.getViewFor(id)
    val list=view.findViewById<ListView>(R.id.ticket_widget_events)
    list.adapter=object: BaseAdapter() {
      override fun getCount()=factory.getCount()
      override fun getItem(position: Int)=position
      override fun getItemId(position: Int)=factory.getItemId(position)
      override fun hasStableIds()=true
      override fun getView(position: Int,convertView: View?,parent: ViewGroup): View {
        val remote=factory.getViewAt(position)!!
        // RemoteViewsService sets this flag before sending an item to the host.
        org.robolectric.util.ReflectionHelpers.callInstanceMethod<Any>(remote,"addFlags",org.robolectric.util.ReflectionHelpers.ClassParameter.from(Int::class.javaPrimitiveType!!,2))
        return (if(convertView == null) remote.apply(context,parent) else convertView.apply{remote.reapply(context,this)}).also{previewFont(it)}
      }
    }
    val d=context.resources.displayMetrics.density
    measure(view,(widthDp*d).toInt(),(heightDp*d).toInt())
    return view
  }
  private fun checkViewport(view: View,factory: TicketEventsFactory) {
    val list=view.findViewById<ListView>(R.id.ticket_widget_events)
    val header=view.findViewById<View>(R.id.ticket_widget_header);val footer=view.findViewById<View>(R.id.ticket_widget_footer)
    assertEquals("header touches viewport",header.bottom,view.findViewById<View>(R.id.ticket_widget_body).top)
    assertEquals("footer at actual bottom",view.height,footer.bottom)
    assertEquals("viewport fills remaining height",view.height-header.height-footer.height,list.height)
    assertTrue("items visible",list.childCount>0)
    assertEquals("first item is top aligned",0,list.getChildAt(0).top)
    val heights=(0 until list.childCount).map{list.getChildAt(it).height}
    assertEquals("uniform card heights",1,heights.distinct().size)
    val last=list.getChildAt(list.childCount-1)
    if(list.lastVisiblePosition < factory.getCount()-1) assertTrue("no growing blank tail at any size",last.bottom >= list.height)
    else assertTrue("few events remain compact and top aligned",last.bottom <= list.height)
    // Card info stays inside its fixed height, including font enlargement.
    for(i in 0 until list.childCount) {
      val item=list.getChildAt(i);val card=item.findViewById<ViewGroup>(R.id.ticket_row)
      val column=card.getChildAt(1) as ViewGroup
      assertTrue("text column fits card: ${column.height}/${card.height}",column.height <= card.height-card.paddingTop-card.paddingBottom)
      for(j in 0 until column.childCount) {
        val child=column.getChildAt(j)
        if(child.visibility != View.GONE) assertTrue("card content must not be clipped at its bottom: ${child.bottom}/${column.height}",child.bottom <= column.height-column.paddingBottom)
      }
      val title=item.findViewById<TextView>(R.id.ticket_title)
      assertEquals(1,title.maxLines)
      val open=item.findViewById<TextView>(R.id.ticket_open);val venue=item.findViewById<TextView>(R.id.ticket_meta)
      assertTrue(open.text.toString().contains("OPEN"));assertTrue(venue.text.toString().contains("渋谷"))
    }
  }
  private fun preview(view: View,name: String) {
    val bitmap=android.graphics.Bitmap.createBitmap(view.width,view.height,android.graphics.Bitmap.Config.ARGB_8888);view.draw(android.graphics.Canvas(bitmap))
    val file=java.io.File(System.getProperty("widget.preview.output","build/widget-previews"),"$name.png");file.parentFile?.mkdirs()
    java.io.FileOutputStream(file).use{bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG,100,it)}
  }
  @Test fun actualViewportFillsWithoutAccumulatingBlankRows() {
    for(times in listOf(false,true)) for(sites in listOf(false,true)) for(favorites in listOf(false,true)) {
      save(times=times,sites=sites);val factory=factory(favorites)
      for(height in listOf(120,180,220,270,300,420,560,720,900)) {
        val view=host(factory,340,height);checkViewport(view,factory)
        if(!favorites && sites && height in listOf(180,300,560)) preview(view,"widget-list-$height-$times")
      }
    }
  }
  @Test fun rowCountUsesActualHostHeightEvenWhenOptionsStayAtDefault() {
    save(times=false,sites=false);val f=factory();val view=host(f,340,180);val list=view.findViewById<ListView>(R.id.ticket_widget_events)
    val initial=list.childCount
    measure(view,340,560);checkViewport(view,f)
    assertTrue("host growth must add visible items without options update",list.childCount >= initial+5)
    measure(view,340,180);checkViewport(view,f);assertEquals(initial,list.childCount)
  }
  @Test fun resizingUsesActualWidthAndPreservesReadableUniformCards() {
    save();val f=factory()
    for(width in listOf(200,240,340,480)) for(height in listOf(180,300,560)) checkViewport(host(f,width,height),f)
  }
  @Test fun enlargedTextRemainsInsideUniformCards() {
    try {for(scale in listOf(1.3f,1.5f,2f)) {RuntimeEnvironment.setFontScale(scale);save();val f=factory();val view=host(f,340,560);checkViewport(view,f);preview(view,"widget-list-font-$scale")}}
    finally{RuntimeEnvironment.setFontScale(1f)}
  }
  @Test @Config(sdk=[34],qualifiers="xhdpi") fun highDensityUsesTheActualViewport() {
    save();val f=factory();checkViewport(host(f,340,560),f)
  }
  @Test fun fewEventsAreCompactAndTopAligned() {
    save(1);val f=factory();val view=host(f,340,560);checkViewport(view,f)
    val list=view.findViewById<ListView>(R.id.ticket_widget_events)
    assertEquals(1,list.childCount);assertTrue(list.getChildAt(0).height < list.height/2)
  }
  @Test fun everyCachedEventIsAvailableBeyondOldSixteenRowLimit() {
    save(45);val f=factory();assertEquals(45,f.getCount())
    for(i in 0 until 45) assertTrue(row(f,i).findViewById<View>(R.id.ticket_row).contentDescription.toString().contains(if(i%2==0) "スペシャルステージ" else "公演${i+1}"))
    assertNull(f.getViewAt(45));assertNull(f.getViewAt(-1))
  }
  @Test fun scrollReachesTheLastEventInsteadOfTruncatingTheFeed() {
    save(45);val f=factory();val view=host(f,340,300);val list=view.findViewById<ListView>(R.id.ticket_widget_events)
    list.setSelection(44);measure(view,340,300)
    assertEquals(44,list.lastVisiblePosition)
    assertTrue(list.getChildAt(list.childCount-1).findViewById<View>(R.id.ticket_row).contentDescription.toString().contains("スペシャルステージ"))
  }
  @Test fun favoritesAndUpcomingHaveSeparateOrderedFeeds() {
    save();val upcoming=factory();val favorites=factory(true)
    assertEquals(30,upcoming.getCount());assertEquals(15,favorites.getCount())
    assertTrue(row(upcoming,1).findViewById<View>(R.id.ticket_row).contentDescription.toString().contains("公演2"))
    assertTrue(row(favorites,1).findViewById<View>(R.id.ticket_row).contentDescription.toString().contains("スペシャルステージ"))
  }
  @Test fun refreshUpdatesFavoritesRemovedEventsAndRowStyle() {
    save();val f=factory();assertEquals(30,f.getCount())
    save(2,times=false,sites=false);f.onDataSetChanged();assertEquals(2,f.getCount())
    assertEquals(View.GONE,row(f).findViewById<View>(R.id.ticket_timing_group).visibility)
    save(0);f.onDataSetChanged();assertEquals(0,f.getCount())
  }
  @Test fun officialTimesAreLastOptionalAndSalesStatusIsAbsent() {
    save();val f=factory();val view=row(f)
    assertEquals("出演 19:00〜19:25",view.findViewById<TextView>(R.id.ticket_performance).text.toString())
    assertEquals("特典会 19:35〜20:25",view.findViewById<TextView>(R.id.ticket_meet).text.toString())
    val group=view.findViewById<View>(R.id.ticket_timing_group);val parent=group.parent as ViewGroup
    assertEquals(group,parent.getChildAt(parent.childCount-1))
    assertEquals(View.GONE,row(f,1).findViewById<View>(R.id.ticket_timing_group).visibility)
    assertFalse(view.findViewById<View>(R.id.ticket_row).contentDescription.toString().contains("発売中"))
    assertEquals("LivePocket",view.findViewById<TextView>(R.id.ticket_site).text.toString());assertEquals("＋1",view.findViewById<TextView>(R.id.ticket_more).text.toString())
  }
  @Test fun siteTagsKeepTheirDistinctColors() {
    save();val prefs=context.getSharedPreferences("ticket_widget",0);val s=TicketEventsFactory.snapshot(context)
    for((i,id) in listOf("ticketdive","livepocket","tiget","eplus").withIndex()) s.getJSONArray("events").getJSONObject(i).put("ticketOffers",JSONArray().put(JSONObject().put("sourceId",id).put("sourceName",id)))
    prefs.edit().putString("snapshot",s.toString()).commit();val f=factory()
    assertEquals(4,(0..3).map{row(f,it).findViewById<TextView>(R.id.ticket_site).currentTextColor}.distinct().size)
  }
  private fun registerLauncher() {
    val intent=Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER).setPackage(context.packageName)
    val info=android.content.pm.ResolveInfo().apply{activityInfo=android.content.pm.ActivityInfo().apply{packageName=context.packageName;name="${context.packageName}.MainActivity";applicationInfo=context.applicationInfo;exported=true}}
    shadowOf(context.packageManager).addResolveInfoForIntent(intent,info)
  }
  @Test fun broadcastOpensTheExactEventWithColdAndWarmActivityFlags() {
    registerLauncher()
    for(id in listOf("event-0","event-24")) {
      val event=JSONObject().put("id",id).put("date","2099-02-01").put("title","公演名").put("eventUrl","https://tiget.net/events/500000")
      FavoriteShowsWidgetProvider().onReceive(context,TicketEventsFactory.click(event,false).setAction(FavoriteShowsWidgetProvider.ACTION_OPEN))
      val intent=shadowOf(RuntimeEnvironment.getApplication()).nextStartedActivity
      assertEquals("/$id",intent.data?.path);assertEquals("公演名",intent.data?.getQueryParameter("title"));assertEquals("2099-02-01",intent.data?.getQueryParameter("date"))
      assertEquals("https://tiget.net/events/500000",intent.data?.getQueryParameter("url"))
      assertTrue(intent.flags and Intent.FLAG_ACTIVITY_SINGLE_TOP != 0);assertTrue(intent.flags and Intent.FLAG_ACTIVITY_NEW_TASK != 0)
    }
  }
  @Test fun renderedCardsAndVenueSendTheirOwnFillInIntentThroughTheTemplate() {
    save();val view=host(factory(),340,420)
    val list=view.findViewById<ListView>(R.id.ticket_widget_events)
    val template=list.tag as android.app.PendingIntent
    assertFalse("collection requires mutable fill-in with an explicit receiver",template.isImmutable)
    assertEquals(FavoriteShowsWidgetProvider::class.java.name,shadowOf(template).savedIntent.component?.className)
    val item=list.getChildAt(0)
    assertTrue(item.findViewById<View>(R.id.ticket_row).performClick())
    val first=shadowOf(RuntimeEnvironment.getApplication()).broadcastIntents.last()
    assertEquals(FavoriteShowsWidgetProvider.ACTION_OPEN,first.action)
    assertEquals("event-0",first.getStringExtra("eventId"));assertFalse(first.getBooleanExtra("map",false))
    assertTrue(item.findViewById<View>(R.id.ticket_meta).performClick())
    val map=shadowOf(RuntimeEnvironment.getApplication()).broadcastIntents.last()
    assertEquals("event-0",map.getStringExtra("eventId"));assertTrue(map.getBooleanExtra("map",false))
    assertEquals("渋谷ライブホール 東京都渋谷区",map.getStringExtra("mapQuery"))
    list.setSelection(24);measure(view,340,420)
    val position=list.firstVisiblePosition
    assertTrue(list.getChildAt(0).findViewById<View>(R.id.ticket_row).performClick())
    assertEquals("event-$position",shadowOf(RuntimeEnvironment.getApplication()).broadcastIntents.last().getStringExtra("eventId"))
  }
  @Test fun venueActionOpensMapsInsteadOfEventDetail() {
    val click=TicketEventsFactory.click(JSONObject().put("id","event-0"),true).putExtra("mapQuery","渋谷ホール 東京都")
    FavoriteShowsWidgetProvider().onReceive(context,click.setAction(FavoriteShowsWidgetProvider.ACTION_OPEN))
    val uri=shadowOf(RuntimeEnvironment.getApplication()).nextStartedActivity.data!!
    assertEquals("www.google.com",uri.host);assertEquals("渋谷ホール 東京都",uri.getQueryParameter("query"))
  }
  @Test fun invalidClickCannotLaunchAnArbitraryUrl() {
    FavoriteShowsWidgetProvider().onReceive(context,Intent(FavoriteShowsWidgetProvider.ACTION_OPEN).putExtra("eventId","../bad"))
    assertNull(shadowOf(RuntimeEnvironment.getApplication()).nextStartedActivity)
  }
  @Test fun serviceSeparatesFavoriteAndUpcomingFactories() {
    save();val service=org.robolectric.Robolectric.buildService(TicketEventsService::class.java).create().get()
    val favorites=service.onGetViewFactory(Intent().putExtra("favorites",true));favorites.onCreate()
    val all=service.onGetViewFactory(Intent());all.onCreate();assertEquals(15,favorites.getCount());assertEquals(30,all.getCount())
  }
  @Test fun stableIdsDoNotShareJavaHashCollisionsAndSurviveRefresh() {
    save(2);val prefs=context.getSharedPreferences("ticket_widget",0);val s=TicketEventsFactory.snapshot(context)
    s.getJSONArray("events").getJSONObject(0).put("id","Aa");s.getJSONArray("events").getJSONObject(1).put("id","BB");prefs.edit().putString("snapshot",s.toString()).commit()
    val f=factory();assertNotEquals(f.getItemId(0),f.getItemId(1));val before=f.getItemId(0);f.onDataSetChanged();assertEquals(before,f.getItemId(0))
  }
  @Test fun emptyOrMalformedSnapshotDoesNotInventEvents() {
    assertEquals(0,factory().getCount())
    context.getSharedPreferences("ticket_widget",0).edit().putString("snapshot","broken").commit();assertEquals(0,factory().getCount())
  }
  @Test @Config(sdk=[28]) fun collectionAndNavigationAlsoWorkBeforeAndroid12() {
    save();val f=factory();checkViewport(host(f,340,420),f)
    registerLauncher();FavoriteShowsWidgetProvider().onReceive(context,TicketEventsFactory.click(JSONObject().put("id","event-1"),false).setAction(FavoriteShowsWidgetProvider.ACTION_OPEN))
    assertEquals("/event-1",shadowOf(RuntimeEnvironment.getApplication()).nextStartedActivity.data?.path)
  }
}
