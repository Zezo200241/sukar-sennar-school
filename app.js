(() => {
  "use strict";

  const cfg = window.APP_CONFIG || {};
  const $ = id => document.getElementById(id);
  const container = $("postsContainer");
  const fallbackImage = "https://cdn.jsdelivr.net/gh/Zezo200241/sukar-sennar-v2@5092ab20a64b64339e44e44df9dec52d908aeaf6/assets/school-cover.jpg";

  const showError = message => {
    const target = container || $("postDetailContainer");
    if (target) target.textContent = message;
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

  const makeSvg = (pathData) => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", pathData);
    svg.append(path);
    return svg;
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

      const fullText = post.content || "";
      const excerptText = fullText.length > 240 ? fullText.slice(0, 240).trimEnd() + "…" : fullText;
      const excerpt = makeElement("p", "post-excerpt", excerptText);
      const readMore = makeElement("a", "read-more", "اعرف المزيد");
      readMore.href = "post.html?slug=" + encodeURIComponent(post.slug || "");
      readMore.setAttribute("aria-label", "اعرف المزيد عن: " + (post.title || "المنشور"));
      excerpt.append(document.createTextNode(" "));
      excerpt.append(readMore);
      body.append(excerpt);

      const meta = makeElement("div", "meta");
      meta.append(makeElement("span", "", "تاريخ النشر: " + formatDate(post.published_at)));
      meta.append(makeElement("span", "eye", "◉ " + Number(post.views || 0).toLocaleString("ar") + " مشاهدة"));

      const share = makeElement("button", "share-icon", "");
      share.type = "button";
      share.append(makeSvg("M18 8a3 3 0 1 0-2.8-4 3 3 0 0 0 2.8 4ZM6 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm12 7a3 3 0 1 0-2.8-4 3 3 0 0 0 2.8 4ZM8.6 10.5l6.8-3.1m-6.8 8.1 6.8 3.1"));
      share.setAttribute("aria-label", "مشاركة المنشور");
      share.title = "مشاركة المنشور";
      share.addEventListener("click", async () => {
        const shareUrl = new URL("post.html?slug=" + encodeURIComponent(post.slug || ""), location.href).href;
        const data = { title: post.title || document.title, text: post.content || "رابطة مدرسة سكر سنار النموذجية", url: shareUrl };
        try {
          if (navigator.share) await navigator.share(data);
          else if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(shareUrl);
            share.classList.add("is-copied");
            share.title = "تم نسخ رابط المنشور";
            share.setAttribute("aria-label", "تم نسخ رابط المنشور");
          } else {
            window.prompt("انسخ رابط المنشور:", shareUrl);
          }
        } catch (_) {}
      });

      const actions = makeElement("div", "post-actions");
      actions.append(meta, share);
      body.append(actions);
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


  async function loadPostDetail(db) {
    const detail = $("postDetailContainer");
    const slug = new URLSearchParams(location.search).get("slug");
    if (!slug || slug.length > 200) {
      detail.textContent = "رابط المنشور غير مكتمل أو غير صالح.";
      return;
    }

    const { data: post, error } = await db.from("posts")
      .select("id,slug,title,content,cover_url,views,published_at")
      .eq("slug", slug).maybeSingle();

    if (error) {
      console.error("Post detail loading error:", error.message);
      detail.textContent = "تعذر تحميل المنشور حالياً. حاول مرة أخرى لاحقاً.";
      return;
    }
    if (!post) {
      detail.textContent = "لم نعثر على هذا المنشور. ربما حُذف أو تغيّر رابطه.";
      return;
    }

    const article = makeElement("article", "article-detail");
    if (post.cover_url) {
      const image = document.createElement("img");
      image.className = "article-cover";
      image.src = safeImageURL(post.cover_url);
      image.alt = post.title || "صورة المنشور";
      image.loading = "eager";
      image.onerror = () => { image.onerror = null; image.src = fallbackImage; };
      article.append(image);
    }
    const body = makeElement("div", "article-body");
    body.append(makeElement("span", "tag", "منشورات الرابطة"));
    body.append(makeElement("h1", "article-title", post.title || "منشور الرابطة"));
    body.append(makeElement("p", "article-meta", "تاريخ النشر: " + formatDate(post.published_at)));
    body.append(makeElement("div", "article-content", post.content || "لا يتوفر محتوى لهذا المنشور."));
    const share = makeElement("button", "outline article-share", "مشاركة المنشور");
    share.type = "button";
    share.addEventListener("click", async () => {
      const url = location.href;
      try {
        if (navigator.share) await navigator.share({ title: post.title, text: post.content || "", url });
        else if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(url);
          share.textContent = "تم نسخ الرابط";
        } else window.prompt("انسخ رابط المنشور:", url);
      } catch (_) {}
    });
    body.append(share);
    article.append(body);
    detail.replaceChildren(article);

    try {
      let visitorId = localStorage.getItem("sukar_visitor_id");
      if (!visitorId && crypto.randomUUID) {
        visitorId = crypto.randomUUID();
        localStorage.setItem("sukar_visitor_id", visitorId);
      }
      if (visitorId) {
        const { error: counterError } = await db.rpc("record_post_view", {
          post_slug: post.slug, visitor_id: visitorId
        });
        if (counterError) console.warn("Post detail view tracking:", counterError.message);
      }
    } catch (trackingError) {
      console.warn("Post detail visitor tracking:", trackingError.message);
    }
    document.title = (post.title || "تفاصيل الخبر") + " | رابطة مدرسة سكر سنار النموذجية";
  }

  async function start() {
    if (!cfg.supabaseUrl || !cfg.supabaseAnonKey || !window.supabase) {
      showError("تعذر الاتصال بقاعدة البيانات. تحقق من إعدادات الموقع.");
      return;
    }
    const db = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
    if ($("postDetailContainer")) {
      await loadPostDetail(db);
      return;
    }
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