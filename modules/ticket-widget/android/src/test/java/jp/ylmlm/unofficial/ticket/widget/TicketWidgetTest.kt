package jp.ylmlm.unofficial.ticket.widget

import android.appwidget.AppWidgetManager
import android.content.Context
import android.os.Bundle
import android.view.View
import android.widget.TextView
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
@Config(sdk = [34])
class TicketWidgetTest {
  private lateinit var context: Context
  @Before fun prepare() {
    context = RuntimeEnvironment.getApplication()
    context.getSharedPreferences("ticket_widget",0).edit().clear().commit()
  }
  private fun previewFont(view: View) {
    val path = System.getenv("WIDGET_PREVIEW_FONT") ?: return
    val font = android.graphics.Typeface.createFromFile(path)
    fun update(node: View) {
      if(node is TextView) node.typeface = android.graphics.Typeface.create(font,node.typeface?.style ?: 0)
      if(node is android.view.ViewGroup) for(i in 0 until node.childCount) update(node.getChildAt(i))
    }
    update(view)
  }
  private fun assertContentEdges(view: View,count: Int) {
    val root = view as android.view.ViewGroup
    fun bounds(id: Int): android.graphics.Rect {
      val child = root.findViewById<View>(id)
      return android.graphics.Rect().apply { child.getDrawingRect(this); root.offsetDescendantRectToMyCoords(child,this) }
    }
    val rowIds = intArrayOf(R.id.ticket_row_0,R.id.ticket_row_1,R.id.ticket_row_2,R.id.ticket_row_3,R.id.ticket_row_4,R.id.ticket_row_5)
    assertEquals("first card close to header",2, bounds(rowIds[0]).top-bounds(R.id.ticket_widget_header).bottom)
    assertEquals("footer reaches the actual widget bottom",view.height,bounds(R.id.ticket_widget_footer).bottom)
    assertTrue("compact cards never overlap footer",bounds(rowIds[count-1]).bottom <= bounds(R.id.ticket_widget_footer).top)
    val surface=root.findViewById<View>(R.id.ticket_widget_root)
    assertEquals("no transparent tail outside the surface",view.height,surface.height)
    val titles = intArrayOf(R.id.ticket_title_0,R.id.ticket_title_1,R.id.ticket_title_2,R.id.ticket_title_3,R.id.ticket_title_4,R.id.ticket_title_5)
    val badges = intArrayOf(R.id.ticket_badges_0,R.id.ticket_badges_1,R.id.ticket_badges_2,R.id.ticket_badges_3,R.id.ticket_badges_4,R.id.ticket_badges_5)
    val opens = intArrayOf(R.id.ticket_open_0,R.id.ticket_open_1,R.id.ticket_open_2,R.id.ticket_open_3,R.id.ticket_open_4,R.id.ticket_open_5)
    val locations = intArrayOf(R.id.ticket_location_0,R.id.ticket_location_1,R.id.ticket_location_2,R.id.ticket_location_3,R.id.ticket_location_4,R.id.ticket_location_5)
    val limit = (3*view.resources.displayMetrics.density).toInt()
    for(index in 0 until count) {
      val previous = if(root.findViewById<View>(badges[index]).visibility == View.VISIBLE) badges[index] else titles[index]
      assertTrue("no blank middle in card $index",bounds(opens[index]).top-bounds(previous).bottom in 0..limit)
      assertTrue("venue stays next to opening time",bounds(locations[index]).top-bounds(opens[index]).bottom in 0..limit)
    }
  }
  private fun save() {
    val snapshot="""{"updatedLabel":"11/1取得","events":[
      {"id":"a","title":"公演A","date":"2099-01-01","sortTime":"09:00","favorite":true,"summary":"1/1 OPEN 18:00 · 会場A"},
      {"id":"b","title":"公演B","date":"2099-01-02","sortTime":"09:00","favorite":false,"summary":"1/2 OPEN 18:00 · 会場B"},
      {"id":"c","title":"公演C","date":"2099-01-03","sortTime":"09:00","favorite":true,"summary":"1/3 OPEN 18:00 · 会場C"},
      {"id":"d","title":"公演D","date":"2099-01-04","favorite":false,"summary":"1/4 OPEN 18:00 · 会場D"},
      {"id":"e","title":"公演E","date":"2099-01-05","favorite":false,"summary":"1/5 OPEN 18:00 · 会場E"},
      {"id":"f","title":"公演F","date":"2099-01-06","favorite":false,"summary":"1/6 OPEN 18:00 · 会場F"},
      {"id":"past","title":"過去公演","date":"2000-01-01","favorite":true,"summary":"過去"}]}"""
    context.getSharedPreferences("ticket_widget",0).edit().putString("snapshot",snapshot).commit()
  }
  @Test fun favoritesAndUpcomingChooseDifferentEvents() {
    save()
    val manager=shadowOf(AppWidgetManager.getInstance(context))
    val favorite=manager.createWidget(FavoriteShowsWidgetProvider::class.java,R.layout.ticket_widget_surface)
    val upcoming=manager.createWidget(UpcomingShowsWidgetProvider::class.java,R.layout.ticket_widget_surface)
    val options=Bundle().apply{putInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT,300)}
    FavoriteShowsWidgetProvider().onAppWidgetOptionsChanged(context,AppWidgetManager.getInstance(context),favorite,options)
    UpcomingShowsWidgetProvider().onAppWidgetOptionsChanged(context,AppWidgetManager.getInstance(context),upcoming,options)
    val favoritesView=manager.getViewFor(favorite)
    val upcomingView=manager.getViewFor(upcoming)
    assertEquals("公演A",favoritesView.findViewById<TextView>(R.id.ticket_title_0).text.toString())
    assertEquals("公演C",favoritesView.findViewById<TextView>(R.id.ticket_title_1).text.toString())
    assertEquals("公演B",upcomingView.findViewById<TextView>(R.id.ticket_title_1).text.toString())
    assertEquals("OPEN 18:00",upcomingView.findViewById<TextView>(R.id.ticket_open_1).text.toString())
    assertEquals("会場B",upcomingView.findViewById<TextView>(R.id.ticket_meta_1).text.toString())
    assertTrue(upcomingView.findViewById<TextView>(R.id.ticket_month_0).text.toString().startsWith("1月"))
    assertEquals("11/1取得",upcomingView.findViewById<TextView>(R.id.ticket_widget_updated).text.toString())
  }
  @Test fun largeWidgetShowsMoreEventsAndSmallWidgetShowsOne() {
    save()
    val manager=AppWidgetManager.getInstance(context)
    val shadow=shadowOf(manager)
    val id=shadow.createWidget(UpcomingShowsWidgetProvider::class.java,R.layout.ticket_widget_surface)
    val large=Bundle().apply{putInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT,420)}
    manager.updateAppWidgetOptions(id,large)
    UpcomingShowsWidgetProvider().onAppWidgetOptionsChanged(context,manager,id,large)
    assertEquals(View.VISIBLE,shadow.getViewFor(id).findViewById<View>(R.id.ticket_row_1).visibility)
    assertEquals("widget view=${shadow.getViewFor(id).javaClass.name} row heights="+listOf(R.id.ticket_row_0,R.id.ticket_row_1,R.id.ticket_row_2).map{shadow.getViewFor(id).findViewById<View>(it).measuredHeight},View.VISIBLE,shadow.getViewFor(id).findViewById<View>(R.id.ticket_row_2).visibility)
    val small=Bundle().apply{putInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT,140)}
    manager.updateAppWidgetOptions(id,small)
    UpcomingShowsWidgetProvider().onAppWidgetOptionsChanged(context,manager,id,small)
    assertEquals(View.GONE,shadow.getViewFor(id).findViewById<View>(R.id.ticket_row_1).visibility)
  }
  @Test
  @org.robolectric.annotation.GraphicsMode(org.robolectric.annotation.GraphicsMode.Mode.NATIVE)
  @Config(sdk = [34], qualifiers = "mdpi")
  fun renderReadableSizes() {
    save()
    val manager = AppWidgetManager.getInstance(context)
    val shadow = shadowOf(manager)
    val counts = mutableMapOf<Int,Int>()
    for (height in listOf(180,220,270,300,420,560)) {
      val id = shadow.createWidget(UpcomingShowsWidgetProvider::class.java,R.layout.ticket_widget_surface)
      val options = Bundle().apply {
        putInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT,height)
        putInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH,340)
      }
      UpcomingShowsWidgetProvider().onAppWidgetOptionsChanged(context,manager,id,options)
      val view = shadow.getViewFor(id)
      previewFont(view)
      view.findViewById<TextView>(R.id.ticket_title_0).text = "表示例：ゆるめるモ！ワンマンライブ"
      view.findViewById<TextView>(R.id.ticket_title_1).text = "表示例：なにぬねるん？スペシャルライブ"
      view.findViewById<TextView>(R.id.ticket_meta_0).text = "渋谷ライブホール（表示例）"
      view.findViewById<TextView>(R.id.ticket_widget_updated).text = "表示サンプル · 11/1 18:00取得"
      val rowIds = intArrayOf(R.id.ticket_row_0,R.id.ticket_row_1,R.id.ticket_row_2,R.id.ticket_row_3,R.id.ticket_row_4,R.id.ticket_row_5)
      val titleIds = intArrayOf(R.id.ticket_title_0,R.id.ticket_title_1,R.id.ticket_title_2,R.id.ticket_title_3,R.id.ticket_title_4,R.id.ticket_title_5)
      // Run production fitting with the same Japanese font used for these previews.
      val (count,lines) = FavoriteShowsWidgetProvider.fitLayout(view,rowIds,titleIds,340,height,6)
      view.measure(View.MeasureSpec.makeMeasureSpec(340,View.MeasureSpec.EXACTLY),View.MeasureSpec.makeMeasureSpec(height,View.MeasureSpec.EXACTLY))
      view.layout(0,0,340,height)
      val bitmap = android.graphics.Bitmap.createBitmap(340,height,android.graphics.Bitmap.Config.ARGB_8888)
      view.draw(android.graphics.Canvas(bitmap))
      val output = java.io.File(System.getProperty("widget.preview.output","build/widget-previews"),"widget-$height.png")
      output.parentFile?.mkdirs()
      java.io.FileOutputStream(output).use { bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG,100,it) }
      val footer = view.findViewById<View>(R.id.ticket_widget_footer)
      assertTrue("footer ${footer.bottom} must fit at height $height with padding ${view.paddingBottom}",footer.bottom <= height - view.paddingBottom)
      val rows = rowIds.map { view.findViewById<View>(it) }.filter { it.visibility == View.VISIBLE }
      assertTrue(rows.size <= 6)
      assertEquals("no outside top padding",0,view.paddingTop)
      assertEquals("no outside bottom padding",0,view.paddingBottom)
      val header = view.findViewById<View>(R.id.ticket_widget_header)
      assertTrue("branded header and clear footer",header.height >= (if(height <= 300) 22 else 32) && footer.height >= (if(height <= 300) 20 else 24))
      rows.forEach { assertEquals("small consistent side margins",view.width-8,it.width) }
      counts[height] = count
      println("height=$height count=$count lines=$lines type=${view.javaClass.name} root=${view.measuredHeight} density=${context.resources.displayMetrics.density} rows=${rowIds.map{view.findViewById<View>(it).measuredHeight}}")
      for (row in rows) assertTrue("cards must not overlap footer at height $height",row.bottom <= footer.top)
      assertTrue("equal card heights to pixel rounding at $height",rows.maxOf{it.height}-rows.minOf{it.height} <= 1)
      val topSpace = view.findViewById<View>(R.id.ticket_widget_top_space).height
      val bottomSpace = view.findViewById<View>(R.id.ticket_widget_bottom_space).height
      assertTrue("no artificial spacers inside the compact panel at $height: $topSpace / $bottomSpace",kotlin.math.abs(topSpace-bottomSpace) <= 1)
      assertTrue("panel must not add gaps around the cards at $height",topSpace+bottomSpace < rows.size)
      assertContentEdges(view,count)
      assertTrue(view.findViewById<TextView>(R.id.ticket_widget_heading).textSize >= 14*context.resources.displayMetrics.scaledDensity)
      assertTrue(view.findViewById<TextView>(R.id.ticket_widget_updated).textSize >= 11*context.resources.displayMetrics.scaledDensity)

    }
    assertTrue("220dp should fit two events: $counts",counts.getValue(220) >= 2)
    assertTrue("270dp keeps three readable events: $counts",counts.getValue(270) >= 3)
    assertTrue("300dp should fit three events: $counts",counts.getValue(300) >= 3)
    assertEquals("560dp should fit all six: $counts",6,counts.getValue(560))
  }
  @Test @Config(sdk = [34], qualifiers = "mdpi")
  fun officialTimesRemainVisibleInCompactUniformCards() {
    save()
    val prefs = context.getSharedPreferences("ticket_widget",0)
    val snapshot = org.json.JSONObject(prefs.getString("snapshot","{}")!!)
    for(index in 0..1) {
      snapshot.getJSONArray("events").getJSONObject(index)
        .put("performanceLabel","出演 19:00〜19:25")
        .put("meetAndGreetLabel","特典会 19:35〜20:25")
        .put("ticketOffers",org.json.JSONArray("""[{"sourceId":"livepocket","sourceName":"LivePocket","availability":"InStock"},{"sourceId":"tiget","sourceName":"TIGET","availability":"SoldOut","stale":true}]"""))
    }
    prefs.edit().putString("snapshot",snapshot.toString()).commit()
    val rowIds = intArrayOf(R.id.ticket_row_0,R.id.ticket_row_1,R.id.ticket_row_2,R.id.ticket_row_3,R.id.ticket_row_4,R.id.ticket_row_5)
    val titleIds = intArrayOf(R.id.ticket_title_0,R.id.ticket_title_1,R.id.ticket_title_2,R.id.ticket_title_3,R.id.ticket_title_4,R.id.ticket_title_5)
    val manager = AppWidgetManager.getInstance(context)
    val shadow = shadowOf(manager)
    try {
      for((height,scale) in listOf(180 to 1f,270 to 1f,270 to 1.5f,420 to 1f,560 to 1f)) {
        RuntimeEnvironment.setFontScale(scale)
        val id = shadow.createWidget(UpcomingShowsWidgetProvider::class.java,R.layout.ticket_widget_surface)
        val options = Bundle().apply {
          putInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT,height)
          putInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH,340)
        }
        UpcomingShowsWidgetProvider().onAppWidgetOptionsChanged(context,manager,id,options)
        val view = shadow.getViewFor(id)
        assertEquals("出演 19:00〜19:25",view.findViewById<TextView>(R.id.ticket_performance_0).text.toString())
        assertEquals(View.VISIBLE,view.findViewById<View>(R.id.ticket_performance_0).visibility)
        assertEquals("特典会 19:35〜20:25",view.findViewById<TextView>(R.id.ticket_meet_0).text.toString())
        assertEquals(View.GONE,view.findViewById<View>(R.id.ticket_performance_2).visibility)
        assertFalse(view.findViewById<View>(R.id.ticket_row_0).contentDescription.toString().contains("発売中"))
        assertEquals("LivePocket",view.findViewById<TextView>(R.id.ticket_site_0).text.toString())
        assertEquals("＋1",view.findViewById<TextView>(R.id.ticket_more_0).text.toString())
        assertTrue(view.findViewById<View>(R.id.ticket_row_0).contentDescription.toString().contains("TIGET"))
        assertTrue(view.findViewById<View>(R.id.ticket_row_0).contentDescription.toString().contains("19:35"))
        previewFont(view)
        view.findViewById<TextView>(R.id.ticket_title_0).text = "表示例：ゆるめるモ！ワンマンライブ"
        view.findViewById<TextView>(R.id.ticket_widget_updated).text = "表示サンプル · 11/2 18:00取得"
        val (count,lines) = FavoriteShowsWidgetProvider.fitLayout(view,rowIds,titleIds,340,height,6)
        view.measure(View.MeasureSpec.makeMeasureSpec(340,View.MeasureSpec.EXACTLY),View.MeasureSpec.makeMeasureSpec(height,View.MeasureSpec.EXACTLY))
        view.layout(0,0,340,height)
        val bitmap = android.graphics.Bitmap.createBitmap(340,height,android.graphics.Bitmap.Config.ARGB_8888)
        view.draw(android.graphics.Canvas(bitmap))
        val output = java.io.File(System.getProperty("widget.preview.output","build/widget-previews"),"widget-times-$height-$scale.png")
        output.parentFile?.mkdirs()
        java.io.FileOutputStream(output).use { bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG,100,it) }
        val rows = rowIds.map{view.findViewById<View>(it)}.filter{it.visibility == View.VISIBLE}
        if(height == 270 && scale == 1f) assertTrue("standard widget keeps two full timetable cards",count >= 2)
        assertTrue("equal heights to pixel rounding at $height / $scale",rows.maxOf{it.height}-rows.minOf{it.height} <= 1)
        val top = view.findViewById<View>(R.id.ticket_widget_top_space).height
        val bottom = view.findViewById<View>(R.id.ticket_widget_bottom_space).height
        assertTrue("no inserted spacers inside the panel at $height / $scale: $top+$bottom",top+bottom < count)
        val footer = view.findViewById<View>(R.id.ticket_widget_footer)
        assertTrue("footer fits at $height / $scale",footer.bottom <= height-view.paddingBottom)
        rows.forEach{assertTrue("cards fit before footer at $height / $scale",it.bottom <= footer.top)}
        assertContentEdges(view,count)
        println("with-times height=$height font=$scale count=$count lines=$lines cardHeight=${rows.first().height} gaps=$top/$bottom")
      }
    } finally { RuntimeEnvironment.setFontScale(1f) }
  }
  @Test @Config(sdk = [34], qualifiers = "port")
  fun portraitUsesMaxHeightInsteadOfLandscapeMinHeight() {
    save()
    val manager = AppWidgetManager.getInstance(context)
    val shadow = shadowOf(manager)
    val id = shadow.createWidget(UpcomingShowsWidgetProvider::class.java,R.layout.ticket_widget_surface)
    val options = Bundle().apply {
      putInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH,340)
      putInt(AppWidgetManager.OPTION_APPWIDGET_MAX_WIDTH,600)
      putInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT,140)
      putInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT,420)
    }
    UpcomingShowsWidgetProvider().onAppWidgetOptionsChanged(context,manager,id,options)
    assertEquals("widget view=${shadow.getViewFor(id).javaClass.name} row heights="+listOf(R.id.ticket_row_0,R.id.ticket_row_1,R.id.ticket_row_2).map{shadow.getViewFor(id).findViewById<View>(it).measuredHeight},View.VISIBLE,shadow.getViewFor(id).findViewById<View>(R.id.ticket_row_2).visibility)
  }
  @Test @Config(sdk = [34], qualifiers = "land")
  fun landscapeUsesMinHeightAndDoesNotOverflowPortraitRows() {
    save()
    val manager = AppWidgetManager.getInstance(context)
    val shadow = shadowOf(manager)
    val id = shadow.createWidget(UpcomingShowsWidgetProvider::class.java,R.layout.ticket_widget_surface)
    val options = Bundle().apply {
      putInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH,340)
      putInt(AppWidgetManager.OPTION_APPWIDGET_MAX_WIDTH,600)
      putInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT,140)
      putInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT,420)
    }
    UpcomingShowsWidgetProvider().onAppWidgetOptionsChanged(context,manager,id,options)
    assertEquals(View.GONE,shadow.getViewFor(id).findViewById<View>(R.id.ticket_row_2).visibility)
  }
  @Test @Config(sdk = [34], qualifiers = "w340dp-h300dp-port-mdpi")
  fun actualLauncherSizeCanFitThreeEvenWhenLegacyBoundsOnlyFitTwo() {
    save()
    val manager = AppWidgetManager.getInstance(context)
    val shadow = shadowOf(manager)
    val id = shadow.createWidget(UpcomingShowsWidgetProvider::class.java,R.layout.ticket_widget_surface)
    val options = Bundle().apply {
      putInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH,340)
      putInt(AppWidgetManager.OPTION_APPWIDGET_MAX_WIDTH,340)
      putInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT,220)
      putInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT,220)
    }
    UpcomingShowsWidgetProvider().onAppWidgetOptionsChanged(context,manager,id,options)
    assertEquals(View.GONE,shadow.getViewFor(id).findViewById<View>(R.id.ticket_row_2).visibility)
    options.putParcelableArrayList(AppWidgetManager.OPTION_APPWIDGET_SIZES,arrayListOf(android.util.SizeF(340f,300f)))
    UpcomingShowsWidgetProvider().onAppWidgetOptionsChanged(context,manager,id,options)
    assertEquals("actual 300dp bounds should display the third event",View.VISIBLE,shadow.getViewFor(id).findViewById<View>(R.id.ticket_row_2).visibility)
  }
  @Test @Config(sdk = [34], qualifiers = "w340dp-h220dp-port-mdpi")
  fun invalidResponsiveSizesFallBackToLegacyBounds() {
    save()
    val manager = AppWidgetManager.getInstance(context)
    val shadow = shadowOf(manager)
    val id = shadow.createWidget(UpcomingShowsWidgetProvider::class.java,R.layout.ticket_widget_surface)
    val options = Bundle().apply {
      putInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT,220)
      putInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH,340)
      putParcelableArrayList(AppWidgetManager.OPTION_APPWIDGET_SIZES,arrayListOf(android.util.SizeF(0f,0f)))
    }
    UpcomingShowsWidgetProvider().onAppWidgetOptionsChanged(context,manager,id,options)
    assertEquals(View.VISIBLE,shadow.getViewFor(id).findViewById<View>(R.id.ticket_row_1).visibility)
    assertEquals(View.GONE,shadow.getViewFor(id).findViewById<View>(R.id.ticket_row_2).visibility)
  }
  @Test fun largerSystemFontStillFitsTheAvailableHeight() {
    RuntimeEnvironment.setFontScale(1.5f)
    try {
      save()
      val manager = AppWidgetManager.getInstance(context)
      val shadow = shadowOf(manager)
      val id = shadow.createWidget(UpcomingShowsWidgetProvider::class.java,R.layout.ticket_widget_surface)
      val options = Bundle().apply {
        putInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT,300)
        putInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH,340)
      }
      UpcomingShowsWidgetProvider().onAppWidgetOptionsChanged(context,manager,id,options)
      val view = shadow.getViewFor(id)
      val density = context.resources.displayMetrics.density
      view.measure(View.MeasureSpec.makeMeasureSpec((340*density).toInt(),View.MeasureSpec.EXACTLY),View.MeasureSpec.makeMeasureSpec(0,View.MeasureSpec.UNSPECIFIED))
      assertTrue(view.measuredHeight <= (300*density).toInt())
      assertEquals(View.VISIBLE,view.findViewById<View>(R.id.ticket_row_0).visibility)
    } finally { RuntimeEnvironment.setFontScale(1f) }
  }
  // Exercise the actual RemoteViews payload without running fitting a second time.
  // Launchers may allocate more pixels than their last reported dp size.
  @Test @Config(sdk = [34], qualifiers = "mdpi")
  fun hostExtraHeightNeverStretchesCardsOrTheirInformation() {
    save()
    val manager = AppWidgetManager.getInstance(context)
    val shadow = shadowOf(manager)
    val id = shadow.createWidget(UpcomingShowsWidgetProvider::class.java,R.layout.ticket_widget_surface)
    val options = Bundle().apply {
      putInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH,340)
      putInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT,300)
    }
    UpcomingShowsWidgetProvider().onAppWidgetOptionsChanged(context,manager,id,options)
    val view = shadow.getViewFor(id)
    val rowIds = intArrayOf(R.id.ticket_row_0,R.id.ticket_row_1,R.id.ticket_row_2,R.id.ticket_row_3,R.id.ticket_row_4,R.id.ticket_row_5)
    var naturalCardHeight = 0
    for(height in listOf(300,340,420,560)) {
      view.measure(View.MeasureSpec.makeMeasureSpec(340,View.MeasureSpec.EXACTLY),View.MeasureSpec.makeMeasureSpec(height,View.MeasureSpec.EXACTLY))
      view.layout(0,0,340,height)
      val rows = rowIds.map{view.findViewById<View>(it)}.filter{it.visibility == View.VISIBLE}
      val header = view.findViewById<View>(R.id.ticket_widget_header)
      val footer = view.findViewById<View>(R.id.ticket_widget_footer)
      val body=view.findViewById<View>(R.id.ticket_widget_body)
      assertEquals("first card always hugs header",2,body.top+rows.first().top-header.bottom)
      assertTrue("cards stay inside body",rows.last().bottom <= body.height)
      assertTrue("equal card heights to rounding",rows.maxOf{it.height}-rows.minOf{it.height} <= 1)
      val panel = view.findViewById<View>(R.id.ticket_widget_root)
      if(naturalCardHeight == 0) naturalCardHeight=rows.first().height
      assertEquals("card height stays compact when host grows",naturalCardHeight,rows.first().height)
      assertEquals("visible surface follows actual host size",height,panel.height)
      assertEquals("panel is top aligned",0,panel.top)
      assertEquals("footer immediately ends the panel",panel.bottom,footer.bottom)
      assertEquals("visible bottom matches allocated bottom",height,panel.bottom)
      val bitmap=android.graphics.Bitmap.createBitmap(340,height,android.graphics.Bitmap.Config.ARGB_8888)
      view.draw(android.graphics.Canvas(bitmap))
      for(y in 0 until height) assertEquals("no invisible occupied pixel in vertical center at y=$y",255,android.graphics.Color.alpha(bitmap.getPixel(170,y)))
      assertContentEdges(view,rows.size)
    }
    assertEquals(View.VISIBLE,view.findViewById<View>(R.id.ticket_widget_heading).visibility)
    assertEquals("モ！のチケット帳",view.findViewById<TextView>(R.id.ticket_widget_heading).text.toString())
  }
  @Test @Config(sdk = [34], qualifiers = "mdpi")
  fun oneFavoriteStaysCompactWhileTheSurfaceCoversItsWholeAllocation() {
    save()
    val prefs=context.getSharedPreferences("ticket_widget",0)
    val snapshot=org.json.JSONObject(prefs.getString("snapshot","{}")!!)
    snapshot.getJSONArray("events").getJSONObject(2).put("favorite",false)
    prefs.edit().putString("snapshot",snapshot.toString()).commit()
    val manager=AppWidgetManager.getInstance(context)
    val shadow=shadowOf(manager)
    val id=shadow.createWidget(FavoriteShowsWidgetProvider::class.java,R.layout.ticket_widget_surface)
    val options=Bundle().apply {
      putInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH,340)
      putInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT,560)
    }
    FavoriteShowsWidgetProvider().onAppWidgetOptionsChanged(context,manager,id,options)
    val view=shadow.getViewFor(id)
    view.measure(View.MeasureSpec.makeMeasureSpec(340,View.MeasureSpec.EXACTLY),View.MeasureSpec.makeMeasureSpec(560,View.MeasureSpec.EXACTLY))
    view.layout(0,0,340,560)
    val panel=view.findViewById<View>(R.id.ticket_widget_root)
    val row=view.findViewById<View>(R.id.ticket_row_0)
    assertEquals(0,panel.top)
    assertTrue("a single event must not become a huge card",row.height < 120)
    assertEquals("sparse widgets still show their full occupied extent",560,panel.height)
    assertEquals("footer identifies real bottom edge",560,view.findViewById<View>(R.id.ticket_widget_footer).bottom)
    val bitmap=android.graphics.Bitmap.createBitmap(340,560,android.graphics.Bitmap.Config.ARGB_8888)
    view.draw(android.graphics.Canvas(bitmap))
    for(y in 0 until 560) assertEquals("sparse surface must not leave transparent reserved area",255,android.graphics.Color.alpha(bitmap.getPixel(170,y)))
    val output=java.io.File(System.getProperty("widget.preview.output","build/widget-previews"),"widget-one-favorite-560.png")
    output.parentFile?.mkdirs()
    java.io.FileOutputStream(output).use{bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG,100,it)}
    assertEquals(View.GONE,view.findViewById<View>(R.id.ticket_row_1).visibility)
    assertContentEdges(view,1)
  }
  @Test fun venuePinOpensGoogleMapsForItsOwnEvent() {
    save()
    val prefs = context.getSharedPreferences("ticket_widget",0)
    val snapshot = org.json.JSONObject(prefs.getString("snapshot","{}")!!)
    snapshot.getJSONArray("events").getJSONObject(0).put("mapQuery","渋谷ホール 東京都渋谷区1-2-3").put("timeLabel","OPEN 18:00 / START 18:30")
    prefs.edit().putString("snapshot",snapshot.toString()).commit()
    val manager = AppWidgetManager.getInstance(context)
    val shadow = shadowOf(manager)
    val id = shadow.createWidget(UpcomingShowsWidgetProvider::class.java,R.layout.ticket_widget_surface)
    val view = shadow.getViewFor(id)
    assertEquals("OPEN 18:00 / START 18:30",view.findViewById<TextView>(R.id.ticket_open_0).text.toString())
    assertTrue(view.findViewById<TextView>(R.id.ticket_meta_0).compoundDrawables[0] != null)
    view.findViewById<View>(R.id.ticket_meta_0).performClick()
    val intent = shadowOf(RuntimeEnvironment.getApplication()).nextStartedActivity
    assertEquals("https",intent.data?.scheme)
    assertEquals("www.google.com",intent.data?.host)
    assertEquals("渋谷ホール 東京都渋谷区1-2-3",intent.data?.getQueryParameter("query"))
  }
  @Test fun sourceBadgesKeepAppColorsAndNeverAnnounceCachedSalesStatus() {
    val cases = listOf(
      listOf("livepocket","LivePocket","InStock","発売中","#FFF3DA","#DDF4E5"),
      listOf("ticketdive","TicketDive","SoldOut","完売","#EAF8F1","#FCE2E5"),
      listOf("tiget","TIGET","Discontinued","発売終了","#EEEAFD","#E9EDF0"),
      listOf("eplus","イープラス","PreOrder","発売前","#FFECEC","#E2EEFF"),
      listOf("other","その他","Unknown","要確認","#E9EDF2","#FFF1D8")
    )
    val manager = AppWidgetManager.getInstance(context)
    val shadow = shadowOf(manager)
    for(c in cases) {
      save()
      val prefs = context.getSharedPreferences("ticket_widget",0)
      val snapshot = org.json.JSONObject(prefs.getString("snapshot","{}")!!)
      val offer = org.json.JSONObject().put("sourceId",c[0]).put("sourceName",c[1]).put("availability",c[2])
      snapshot.getJSONArray("events").getJSONObject(0).put("ticketOffers",org.json.JSONArray().put(offer))
      prefs.edit().putString("snapshot",snapshot.toString()).commit()
      val id = shadow.createWidget(UpcomingShowsWidgetProvider::class.java,R.layout.ticket_widget_surface)
      val options = Bundle().apply {putInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH,340);putInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT,300)}
      UpcomingShowsWidgetProvider().onAppWidgetOptionsChanged(context,manager,id,options)
      val view = shadow.getViewFor(id)
      val source = view.findViewById<TextView>(R.id.ticket_site_0)
      assertEquals(c[1],source.text.toString())
      assertFalse(view.findViewById<View>(R.id.ticket_row_0).contentDescription.toString().contains(c[3]))
      assertEquals(android.graphics.Color.parseColor(c[4]),(source.background as android.graphics.drawable.GradientDrawable).color?.defaultColor ?: 0)
    }
  }
  @Test @Config(sdk = [34], qualifiers = "mdpi")
  fun smallWidgetsPrioritizeCoreInformationAndNeverClipAtLargeFonts() {
    save()
    val prefs=context.getSharedPreferences("ticket_widget",0)
    val snapshot=org.json.JSONObject(prefs.getString("snapshot","{}")!!)
    snapshot.getJSONArray("events").getJSONObject(0).put("performanceLabel","出演 19:00〜19:25").put("ticketOffers",org.json.JSONArray("[{\"sourceId\":\"tiget\",\"sourceName\":\"TIGET\",\"availability\":\"SoldOut\"}]"))
    prefs.edit().putString("snapshot",snapshot.toString()).commit()
    val manager=AppWidgetManager.getInstance(context)
    val shadow=shadowOf(manager)
    try {
      for(scale in listOf(1f,1.5f)) {
        RuntimeEnvironment.setFontScale(scale)
        val id=shadow.createWidget(UpcomingShowsWidgetProvider::class.java,R.layout.ticket_widget_surface)
        for(height in listOf(120,140,180,300)) {
          val options=Bundle().apply {
            putInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH,340)
            putInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT,height)
          }
          UpcomingShowsWidgetProvider().onAppWidgetOptionsChanged(context,manager,id,options)
          val view=shadow.getViewFor(id)
          view.measure(View.MeasureSpec.makeMeasureSpec(340,View.MeasureSpec.EXACTLY),View.MeasureSpec.makeMeasureSpec(height,View.MeasureSpec.EXACTLY))
          view.layout(0,0,340,height)
          val panel=view.findViewById<View>(R.id.ticket_widget_root)
          assertEquals(0,panel.top)
          assertEquals("surface matches actual allocated height",height,panel.height)
          val body=view.findViewById<View>(R.id.ticket_widget_body)
          val first=view.findViewById<View>(R.id.ticket_row_0)
          if(first.visibility == View.VISIBLE) assertTrue("small cards must fit inside viewport",first.bottom <= body.height)
          else assertTrue("resize hint must fit inside viewport",view.findViewById<View>(R.id.ticket_widget_empty).bottom <= body.height)
          if(height == 120 && scale == 1f) {
            assertEquals(View.VISIBLE,view.findViewById<View>(R.id.ticket_row_0).visibility)
            assertEquals("OPEN 18:00",view.findViewById<TextView>(R.id.ticket_open_0).text.toString())
            assertEquals("会場A",view.findViewById<TextView>(R.id.ticket_meta_0).text.toString())
            assertEquals(View.GONE,view.findViewById<View>(R.id.ticket_badges_0).visibility)
          }
          if(height == 300) {
            assertEquals(View.VISIBLE,view.findViewById<View>(R.id.ticket_badges_0).visibility)
            assertEquals(View.VISIBLE,view.findViewById<View>(R.id.ticket_timing_group_0).visibility)
          }
          val bitmap=android.graphics.Bitmap.createBitmap(340,height,android.graphics.Bitmap.Config.ARGB_8888)
          view.draw(android.graphics.Canvas(bitmap))
          val output=java.io.File(System.getProperty("widget.preview.output","build/widget-previews"),"widget-small-$height-$scale.png")
          output.parentFile?.mkdirs()
          java.io.FileOutputStream(output).use{bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG,100,it)}
        }
      }
    } finally {RuntimeEnvironment.setFontScale(1f)}
  }
  @Test fun boldIsReservedForAppNameAndEventTitles() {
    save()
    val manager=shadowOf(AppWidgetManager.getInstance(context))
    val id=manager.createWidget(UpcomingShowsWidgetProvider::class.java,R.layout.ticket_widget_surface)
    val view=manager.getViewFor(id)
    assertTrue(view.findViewById<TextView>(R.id.ticket_widget_heading).typeface.isBold)
    assertTrue(view.findViewById<TextView>(R.id.ticket_title_0).typeface.isBold)
    for(textId in listOf(R.id.ticket_day_0,R.id.ticket_open_0,R.id.ticket_meta_0,R.id.ticket_performance_0,R.id.ticket_meet_0,R.id.ticket_site_0,R.id.ticket_widget_mode,R.id.ticket_widget_updated,R.id.ticket_widget_list)) {
      assertFalse("secondary information should have regular weight",view.findViewById<TextView>(textId).typeface.isBold)
    }
  }
  @Test fun emptySnapshotOffersAppRefreshInsteadOfFakeEvents() {
    val manager=shadowOf(AppWidgetManager.getInstance(context))
    val id=manager.createWidget(FavoriteShowsWidgetProvider::class.java,R.layout.ticket_widget_surface)
    val view=manager.getViewFor(id)
    assertEquals(View.VISIBLE,view.findViewById<View>(R.id.ticket_widget_empty).visibility)
    assertEquals(View.GONE,view.findViewById<View>(R.id.ticket_row_0).visibility)
    assertTrue(view.findViewById<TextView>(R.id.ticket_widget_empty).text.contains("アプリ"))
  }
}
