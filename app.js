(() => {
  "use strict";

  const cfg = window.APP_CONFIG || {};
  const $ = id => document.getElementById(id);
  const container = $("postsContainer");
  const fallbackImage = "https://cdn.jsdelivr.net/gh/Zezo200241/sukar-sennar-v2@5092ab20a64b64339e44e44df9dec52d908aeaf6/assets/school-cover.jpg";

  const showError = message => {
    if (container) container.textContent = message;
  };

  const formatDate = value => {
    try {
      return new Intl.DateTimeFormat("ar-SD", { year: "numeric", month: "long", day: "numeric" }).format(new Date(value));
    } catch (_) { return "غير محدد"; }
  };

  const makeElement = (tag, className, text) => {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
  };

  const safeImageURL = value => {
    if (!value) return fallbackImage;
    try {
      const url = new URL(value, location.href);
      if (url.protocol === "https:" || url.protocol === "http:") return url.href;
    } catch (_) {}
    return fallbackImage;
  };

  function renderPosts(posts) {
    if (!container) return;
    container.replaceChildren();
    if (!posts.length) {
      container.append(makeElement("p", "", "لا توجد منشورات منشورة حالياً."));
      return;
    }
    posts.forEach(post => {
      const article = makeElement("article", "post-card");
      const img = document.createElement("img");
      img.src = safeImageURL(post.cover_url);
      img.alt = post.title || "منشور الرابطة";
      img.loading = "lazy";
      img.onerror = () => { img.onerror = null; img.src = fallbackImage; };

      const body = makeElement("div", "post-body");
      body.append(makeElement("span", "tag", "منشورات الرابطة"));
      body.append(makeElement("h3", "", post.title || ""));
      body.append(makeElement("p", "", post.content || ""));

      const meta = makeElement("div", "meta");
      meta.append(makeElement("span", "", "تاريخ النشر: " + formatDate(post.published_at)));
      meta.append(makeElement("span", "eye", "◉ " + Number(post.views || 0).toLocaleString("ar") + " مشاهدة"));

      const share = makeElement("button", "outline", "مشاركة المنشور ↗");
      share.type = "button";
      share.addEventListener("click", async () => {
        const data = { title: post.title || document.title, text: post.content || "رابطة مدرسة سكر سنار النموذجية", url: location.href };
        try {
          if (navigator.share) await navigator.share(data);
          else { await navigator.clipboard.writeText(location.href); share.textContent = "تم نسخ الرابط"; }
        } catch (_) {}
      });
      body.append(meta, share);
      article.append(img, body);
      container.append(article);
    });
  }

  const menu = $("menuBtn");
  if (menu) menu.addEventListener("click", () => {
    const nav = $("nav");
    nav?.classList.toggle("open");
    menu.setAttribute("aria-expanded", nav?.classList.contains("open") ? "true" : "false");
  });
  document.querySelectorAll("#nav a").forEach(a => a.addEventListener("click", () => $("nav")?.classList.remove("open")));

  async function start() {
    if (!cfg.supabaseUrl || !cfg.supabaseAnonKey || !window.supabase) {
      showError("تعذر الاتصال بقاعدة البيانات. تحقق من إعدادات الموقع.");
      return;
    }
    const db = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
    const { data, error } = await db.from("posts")
      .select("id,slug,title,content,cover_url,views,published_at")
      .order("published_at", { ascending: false });
    if (error) {
      console.error("Posts loading error:", error.message);
      showError("تعذر تحميل المنشورات حالياً.");
      return;
    }

    let posts = data || [];
    if (cfg.postSlug) {
      try {
        let visitorId = localStorage.getItem("sukar_visitor_id");
        if (!visitorId) {
          visitorId = crypto.randomUUID();
          localStorage.setItem("sukar_visitor_id", visitorId);
        }
        const { data: count, error: counterError } = await db.rpc("record_post_view", {
          post_slug: cfg.postSlug,
          visitor_id: visitorId
        });
        if (!counterError && count !== null) {
          posts = posts.map(p => p.slug === cfg.postSlug ? { ...p, views: Number(count) } : p);
        } else if (counterError) console.warn("View counter error:", counterError.message);
      } catch (error) { console.warn("Visitor tracking error:", error.message); }
    }
    renderPosts(posts);
  }

  start().catch(error => {
    console.error(error);
    showError("حدث خطأ غير متوقع أثناء تحميل الموقع.");
  });
})();
