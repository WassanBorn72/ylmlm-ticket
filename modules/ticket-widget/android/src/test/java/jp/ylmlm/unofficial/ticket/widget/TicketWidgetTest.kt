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
    val options=Bundle().apply{putInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT,200)}
    FavoriteShowsWidgetProvider().onAppWidgetOptionsChanged(context,AppWidgetManager.getInstance(context),favorite,options)
    UpcomingShowsWidgetProvider().onAppWidgetOptionsChanged(context,AppWidgetManager.getInstance(context),upcoming,options)
    val favoritesView=manager.getViewFor(favorite)
    val upcomingView=manager.getViewFor(upcoming)
    assertEquals("公演A",favoritesView.findViewById<TextView>(R.id.ticket_title_0).text.toString())
    assertEquals("公演C",favoritesView.findViewById<TextView>(R.id.ticket_title_1).text.toString())
    assertEquals("公演B",upcomingView.findViewById<TextView>(R.id.ticket_title_1).text.toString())
    assertEquals("11/1取得",upcomingView.findViewById<TextView>(R.id.ticket_widget_updated).text.toString())
  }
  @Test fun largeWidgetShowsThreeAndSmallWidgetShowsOne() {
    save()
    val manager=AppWidgetManager.getInstance(context)
    val shadow=shadowOf(manager)
    val id=shadow.createWidget(UpcomingShowsWidgetProvider::class.java,R.layout.ticket_widget)
    val large=Bundle().apply{putInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT,300)}
    manager.updateAppWidgetOptions(id,large)
    UpcomingShowsWidgetProvider().onAppWidgetOptionsChanged(context,manager,id,large)
    assertEquals(View.VISIBLE,shadow.getViewFor(id).findViewById<View>(R.id.ticket_row_2).visibility)
    val small=Bundle().apply{putInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT,140)}
    manager.updateAppWidgetOptions(id,small)
    UpcomingShowsWidgetProvider().onAppWidgetOptionsChanged(context,manager,id,small)
    assertEquals(View.GONE,shadow.getViewFor(id).findViewById<View>(R.id.ticket_row_1).visibility)
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
