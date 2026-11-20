(() => {
  "use strict";

  const cfg = window.APP_CONFIG || {};
  const $ = id => document.getElementById(id);
  const panel = $("analyticsPanel");
  if (!panel) return;

  const status = $("analyticsStatus");
  const refreshBtn = $("refreshAnalyticsBtn");
  const db = window.supabase && cfg.supabaseUrl && cfg.supabaseAnonKey
    ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey)
    : null;

  let loading = false;
  let authorized = false;
  let lastLoadedAt = null;

  const say = message => { status.textContent = message; };
  const number = value => Number(value || 0).toLocaleString("ar");
  const dateTime = value => value
    ? new Intl.DateTimeFormat("ar-SD", {
        dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Khartoum"
      }).format(new Date(value))
    : "لا توجد بيانات";

  function el(tag, className, content) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (content !== undefined) node.textContent = content;
    return node;
  }

  function metric(label, value, hint) {
    const card = el("article", "analytics-metric");
    card.append(el("span", "analytics-metric-label", label));
    card.append(el("strong", "analytics-metric-value", number(value)));
    if (hint) card.append(el("small", "analytics-metric-hint", hint));
    return card;
  }

  function khDateKey(value) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Africa/Khartoum",
      year: "numeric", month: "2-digit", day: "2-digit"
    }).formatToParts(new Date(value));
    const part = type => parts.find(x => x.type === type)?.value || "";
    return `${part("year")}-${part("month")}-${part("day")}`;
  }

  function dayLabel(date) {
    return new Intl.DateTimeFormat("ar-SD", {
      timeZone: "Africa/Khartoum", weekday: "short", day: "numeric"
    }).format(date);
  }

  async function verifyAdmin() {
    if (!db) throw new Error("إعدادات الاتصال بقاعدة البيانات غير مكتملة.");
    const { data: sessionData, error: sessionError } = await db.auth.getSession();
    if (sessionError) throw sessionError;
    const user = sessionData.session?.user;
    if (!user) return false;

    const { data, error } = await db.from("admins")
      .select("user_id").eq("user_id", user.id).maybeSingle();
    if (error) throw error;
    return !!data;
  }

  async function fetchAllViewRows() {
    const all = [];
    const pageSize = 1000;
    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await db.from("post_views")
        .select("post_slug,visitor_id,last_viewed_at")
        .order("last_viewed_at", { ascending: false })
        .range(offset, offset + pageSize - 1);
      if (error) throw error;
      const rows = data || [];
      all.push(...rows);
      if (rows.length < pageSize) break;
    }
    return all;
  }

  function renderDaily(rows) {
    const chart = $("analyticsDailyChart");
    chart.replaceChildren();
    const now = new Date();
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      days.push({ date: d, key: khDateKey(d), count: 0 });
    }
    const lookup = new Map(days.map(d => [d.key, d]));
    rows.forEach(row => {
      if (!row.last_viewed_at) return;
      const day = lookup.get(khDateKey(row.last_viewed_at));
      if (day) day.count++;
    });
    const max = Math.max(1, ...days.map(d => d.count));
    days.forEach(day => {
      const item = el("div", "analytics-day");
      const barWrap = el("div", "analytics-bar-wrap");
      const bar = el("div", "analytics-bar");
      bar.style.height = `${Math.max(4, (day.count / max) * 100)}%`;
      bar.title = `${number(day.count)} سجل`;
      barWrap.append(bar);
      item.append(barWrap);
      item.append(el("strong", "analytics-day-count", number(day.count)));
      item.append(el("span", "analytics-day-label", dayLabel(day.date)));
      chart.append(item);
    });
  }

  function renderPosts(posts, rows) {
    const list = $("analyticsPosts");
    list.replaceChildren();
    const visitorSets = new Map();
    const lastViews = new Map();

    rows.forEach(row => {
      if (!visitorSets.has(row.post_slug)) visitorSets.set(row.post_slug, new Set());
      if (row.visitor_id) visitorSets.get(row.post_slug).add(row.visitor_id);
      const old = lastViews.get(row.post_slug);
      if (row.last_viewed_at && (!old || new Date(row.last_viewed_at) > new Date(old))) {
        lastViews.set(row.post_slug, row.last_viewed_at);
      }
    });

    const sorted = [...posts].sort((a, b) => Number(b.views || 0) - Number(a.views || 0));
    if (!sorted.length) {
      list.append(el("p", "", "لا توجد منشورات."));
      return;
    }

    sorted.forEach(post => {
      const row = el("article", "analytics-post-row");
      const main = el("div", "analytics-post-main");
      main.append(el("strong", "", post.title || "منشور بلا عنوان"));
      main.append(el("small", "", post.slug || ""));
      const stats = el("div", "analytics-post-stats");
      stats.append(el("span", "", `${number(post.views)} مشاهدة`));
      stats.append(el("span", "", `${number(visitorSets.get(post.slug)?.size || 0)} زائر فريد مسجّل`));
      stats.append(el("span", "", `آخر مشاهدة: ${dateTime(lastViews.get(post.slug))}`));
      row.append(main, stats);
      list.append(row);
    });
  }

  async function load() {
    if (loading) return;
    loading = true;
    refreshBtn.disabled = true;
    say("جارٍ التحقق من الصلاحيات وتحميل الإحصائيات...");
    try {
      authorized = await verifyAdmin();
      if (!authorized) {
        panel.hidden = true;
        say("تظهر الإحصائيات لحسابات المشرفين المعتمدة فقط.");
        return;
      }

      const { data: posts, error: postsError } = await db.from("posts")
        .select("id,slug,title,views,published_at")
        .order("published_at", { ascending: false });
      if (postsError) throw postsError;

      let rows = [];
      let trackingWarning = "";
      try {
        rows = await fetchAllViewRows();
      } catch (error) {
        console.warn("Analytics tracking read failed:", error);
        trackingWarning = "تعذرت قراءة سجلات post_views؛ تظهر أرقام عداد المنشورات فقط. تحقق من صلاحية SELECT للمشرفين على جدول التتبع.";
      }

      const visitorIds = new Set(rows.map(row => row.visitor_id).filter(Boolean));
      const totalViews = (posts || []).reduce((sum, post) => sum + Number(post.views || 0), 0);
      const metrics = $("analyticsMetrics");
      metrics.replaceChildren(
        metric("عدد المنشورات", (posts || []).length),
        metric("إجمالي المشاهدات", totalViews),
        metric("سجلات التتبع", rows.length, trackingWarning ? "بيانات التتبع غير مكتملة" : "من جدول post_views"),
        metric("معرّفات الزوار الفريدة", visitorIds.size, "ليست إثباتاً لعدد الأشخاص الفعلي")
      );

      renderDaily(rows);
      renderPosts(posts || [], rows);
      lastLoadedAt = new Date();
      say((trackingWarning ? trackingWarning + " " : "") +
        `آخر تحديث: ${dateTime(lastLoadedAt.toISOString())}`);
    } catch (error) {
      console.error("Analytics error:", error);
      say("تعذر تحميل الإحصائيات: " + (error.message || "خطأ غير معروف"));
    } finally {
      loading = false;
      refreshBtn.disabled = false;
    }
  }

  refreshBtn.addEventListener("click", load);

  // لوحة الإحصائيات لا تُحمّل إلا بعد أن تكشف لوحة الإدارة عن المحرر للمستخدم.
  const editor = $("editor");
  if (editor) {
    const observer = new MutationObserver(() => {
      if (!editor.hidden) {
        panel.hidden = false;
        load();
      } else {
        panel.hidden = true;
      }
    });
    observer.observe(editor, { attributes: true, attributeFilter: ["hidden"] });
    if (!editor.hidden) {
      panel.hidden = false;
      load();
    }
  }

  if (db) {
    db.auth.onAuthStateChange(event => {
      if (event === "SIGNED_OUT") {
        panel.hidden = true;
        authorized = false;
      }
    });
  }
})();
