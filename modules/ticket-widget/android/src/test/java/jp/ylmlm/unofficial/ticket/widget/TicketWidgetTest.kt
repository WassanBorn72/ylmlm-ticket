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
@Config(sdk = [34])
class TicketWidgetTest {
  private lateinit var context: Context
  @Before fun prepare() {
    context = RuntimeEnvironment.getApplication()
    context.getSharedPreferences("ticket_widget",0).edit().clear().commit()
  }
  private fun save() {
    val snapshot="""{"updatedLabel":"11/1取得","events":[
      {"id":"a","title":"公演A","date":"2099-01-01","sortTime":"09:00","favorite":true,"summary":"1/1 OPEN 18:00 · 会場A"},
      {"id":"b","title":"公演B","date":"2099-01-02","sortTime":"09:00","favorite":false,"summary":"1/2 OPEN 18:00 · 会場B"},
      {"id":"c","title":"公演C","date":"2099-01-03","sortTime":"09:00","favorite":true,"summary":"1/3 OPEN 18:00 · 会場C"},
      {"id":"past","title":"過去公演","date":"2000-01-01","favorite":true,"summary":"過去"}]}"""
    context.getSharedPreferences("ticket_widget",0).edit().putString("snapshot",snapshot).commit()
  }
  @Test fun favoritesAndUpcomingChooseDifferentEvents() {
    save()
    val manager=shadowOf(AppWidgetManager.getInstance(context))
    val favorite=manager.createWidget(FavoriteShowsWidgetProvider::class.java,R.layout.ticket_widget)
    val upcoming=manager.createWidget(UpcomingShowsWidgetProvider::class.java,R.layout.ticket_widget)
    val options=Bundle().apply{putInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT,300)}
    FavoriteShowsWidgetProvider().onAppWidgetOptionsChanged(context,AppWidgetManager.getInstance(context),favorite,options)
    UpcomingShowsWidgetProvider().onAppWidgetOptionsChanged(context,AppWidgetManager.getInstance(context),upcoming,options)
    val favoritesView=manager.getViewFor(favorite)
    val upcomingView=manager.getViewFor(upcoming)
    assertEquals("公演A",favoritesView.findViewById<TextView>(R.id.ticket_title_0).text.toString())
    assertEquals("公演C",favoritesView.findViewById<TextView>(R.id.ticket_title_1).text.toString())
    assertEquals("公演B",upcomingView.findViewById<TextView>(R.id.ticket_title_1).text.toString())
    assertEquals("OPEN 18:00",upcomingView.findViewById<TextView>(R.id.ticket_time_1).text.toString())
    assertEquals("会場B",upcomingView.findViewById<TextView>(R.id.ticket_meta_1).text.toString())
    assertEquals("1月",upcomingView.findViewById<TextView>(R.id.ticket_month_0).text.toString())
    assertEquals("11/1取得",upcomingView.findViewById<TextView>(R.id.ticket_widget_updated).text.toString())
  }
  @Test fun largeWidgetShowsTwoAndSmallWidgetShowsOne() {
    save()
    val manager=AppWidgetManager.getInstance(context)
    val shadow=shadowOf(manager)
    val id=shadow.createWidget(UpcomingShowsWidgetProvider::class.java,R.layout.ticket_widget)
    val large=Bundle().apply{putInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT,420)}
    manager.updateAppWidgetOptions(id,large)
    UpcomingShowsWidgetProvider().onAppWidgetOptionsChanged(context,manager,id,large)
    assertEquals(View.VISIBLE,shadow.getViewFor(id).findViewById<View>(R.id.ticket_row_1).visibility)
    assertEquals(View.GONE,shadow.getViewFor(id).findViewById<View>(R.id.ticket_row_2).visibility)
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
    for (height in listOf(180,300,420)) {
      val id = shadow.createWidget(UpcomingShowsWidgetProvider::class.java,R.layout.ticket_widget)
      val options = Bundle().apply {
        putInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT,height)
        putInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH,340)
      }
      UpcomingShowsWidgetProvider().onAppWidgetOptionsChanged(context,manager,id,options)
      val view = shadow.getViewFor(id)
      val fontPath = System.getenv("WIDGET_PREVIEW_FONT")
      val font = fontPath?.let { android.graphics.Typeface.createFromFile(it) }
      fun setFont(node: View) {
        if (node is TextView && font != null) node.typeface = android.graphics.Typeface.create(font,node.typeface?.style ?: 0)
        if (node is android.view.ViewGroup) for (i in 0 until node.childCount) setFont(node.getChildAt(i))
      }
      setFont(view)
      view.findViewById<TextView>(R.id.ticket_title_0).text = "表示例：ゆるめるモ！ワンマンライブ"
      view.findViewById<TextView>(R.id.ticket_meta_0).text = "渋谷ライブホール（表示例）"
      view.findViewById<TextView>(R.id.ticket_widget_updated).text = "表示サンプル · 11/1 18:00取得"
      view.measure(View.MeasureSpec.makeMeasureSpec(340,View.MeasureSpec.EXACTLY),View.MeasureSpec.makeMeasureSpec(height,View.MeasureSpec.EXACTLY))
      view.layout(0,0,340,height)
      val footer = view.findViewById<View>(R.id.ticket_widget_footer)
      assertTrue("footer must fit at height $height",footer.bottom <= height - view.paddingBottom)
      val rows = listOf(R.id.ticket_row_0,R.id.ticket_row_1,R.id.ticket_row_2).map { view.findViewById<View>(it) }.filter { it.visibility == View.VISIBLE }
      assertTrue(rows.size <= 2)
      for (row in rows) assertTrue("cards must not overlap footer at height $height",row.bottom <= footer.top)
      val bitmap = android.graphics.Bitmap.createBitmap(340,height,android.graphics.Bitmap.Config.ARGB_8888)
      view.draw(android.graphics.Canvas(bitmap))
      val output = java.io.File(System.getProperty("widget.preview.output","build/widget-previews"),"widget-$height.png")
      output.parentFile.mkdirs()
      java.io.FileOutputStream(output).use { bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG,100,it) }
    }
  }
  @Test fun emptySnapshotOffersAppRefreshInsteadOfFakeEvents() {
    val manager=shadowOf(AppWidgetManager.getInstance(context))
    val id=manager.createWidget(FavoriteShowsWidgetProvider::class.java,R.layout.ticket_widget)
    val view=manager.getViewFor(id)
    assertEquals(View.VISIBLE,view.findViewById<View>(R.id.ticket_widget_empty).visibility)
    assertEquals(View.GONE,view.findViewById<View>(R.id.ticket_row_0).visibility)
    assertTrue(view.findViewById<TextView>(R.id.ticket_widget_empty).text.contains("アプリ"))
  }
}
