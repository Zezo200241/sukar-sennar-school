(() => {
  "use strict";
  const cfg = window.APP_CONFIG || {};
  const $ = id => document.getElementById(id);
  const status = $("status"), login = $("login"), editor = $("editor"), recovery = $("recovery");
  const say = message => { status.textContent = message; };
  if (!cfg.supabaseUrl || !cfg.supabaseAnonKey || !window.supabase) {
    say("إعدادات Supabase غير مكتملة أو مكتبة الاتصال لم تُحمّل.");
    return;
  }
  const db = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
  let currentUser = null, busy = false, recoveryMode = location.hash.includes("type=recovery");
  function setBusy(value) {
    busy = value;
    ["loginBtn", "saveBtn", "updatePasswordBtn"].forEach(id => { const el = $(id); if (el) el.disabled = value; });
  }
  function showRecovery() {
    recoveryMode = true; login.hidden = true; editor.hidden = true; recovery.hidden = false;
    say("تم فتح استعادة الحساب. أدخل كلمة المرور الجديدة.");
  }
  async function verifyAdmin(user) {
    if (!user) return false;
    const { data, error } = await db.from("admins").select("user_id").eq("user_id", user.id).maybeSingle();
    if (error) { console.error("Admin verification:", error.message); say("تعذر التحقق من صلاحيات المشرف: " + error.message); return false; }
    return !!data;
  }
  async function refresh() {
    const list = $("postsList"); list.textContent = "جارٍ تحميل المنشورات...";
    const { data, error } = await db.from("posts").select("id,title,slug,views,published_at").order("published_at", { ascending: false });
    if (error) { list.textContent = "تعذر تحميل المنشورات: " + error.message; return; }
    list.replaceChildren();
    if (!data || !data.length) { list.textContent = "لا توجد منشورات."; return; }
    data.forEach(post => {
      const row = document.createElement("div"); row.className = "post-row";
      const title = document.createElement("strong"); title.textContent = post.title;
      const details = document.createElement("p");
      details.textContent = Number(post.views || 0).toLocaleString("ar") + " مشاهدة — " + new Date(post.published_at).toLocaleDateString("ar");
      row.append(title, details); list.append(row);
    });
  }
  async function showSession() {
    if (recoveryMode) return;
    const { data, error } = await db.auth.getSession();
    if (error) { say("تعذر قراءة جلسة الدخول: " + error.message); return; }
    const user = data.session?.user || null;
    if (!user) { currentUser = null; login.hidden = false; editor.hidden = true; return; }
    const allowed = await verifyAdmin(user);
    if (!allowed) {
      await db.auth.signOut(); currentUser = null; login.hidden = false; editor.hidden = true;
      say("هذا الحساب ليس ضمن المشرفين المعتمدين."); return;
    }
    currentUser = user; login.hidden = true; recovery.hidden = true; editor.hidden = false;
    say("تم التحقق من صلاحيات المشرف."); await refresh();
  }
  $("updatePasswordBtn").addEventListener("click", async () => {
    if (busy) return;
    const password = $("newPassword").value, confirm = $("confirmPassword").value;
    if (password.length < 8) { say("كلمة المرور يجب ألا تقل عن 8 أحرف."); return; }
    if (password !== confirm) { say("كلمتا المرور غير متطابقتين."); return; }
    setBusy(true); say("جارٍ تحديث كلمة المرور...");
    try {
      const { data, error } = await db.auth.updateUser({ password });
      if (error) { say("تعذر تحديث كلمة المرور: " + error.message); return; }
      $("newPassword").value = ""; $("confirmPassword").value = ""; recoveryMode = false;
      if (data.user) {
        await db.auth.signOut(); currentUser = null; recovery.hidden = true; editor.hidden = true; login.hidden = false; $("password").value = "";
        say("تم تحديث كلمة المرور. يمكنك الآن تسجيل الدخول بها.");
      } else say("تم تحديث كلمة المرور. سجّل الدخول من جديد.");
    } catch (e) { console.error(e); say("حدث خطأ أثناء تحديث كلمة المرور."); }
    finally { setBusy(false); }
  });
  $("loginBtn").addEventListener("click", async () => {
    if (busy) return;
    const email = $("email").value.trim(), password = $("password").value;
    if (!email || !password) { say("أدخل البريد الإلكتروني وكلمة المرور."); return; }
    setBusy(true);
    try {
      const { error } = await db.auth.signInWithPassword({ email, password });
      if (error) { say("فشل تسجيل الدخول: " + error.message); return; }
      await showSession();
    } catch (e) { say("حدث خطأ أثناء تسجيل الدخول."); console.error(e); }
    finally { setBusy(false); }
  });
  $("logoutBtn").addEventListener("click", async () => {
    const { error } = await db.auth.signOut();
    if (error) say("تعذر تسجيل الخروج: " + error.message);
    else { currentUser = null; editor.hidden = true; login.hidden = false; say("تم تسجيل الخروج."); }
  });
  $("saveBtn").addEventListener("click", async () => {
    if (busy || !currentUser) return;
    setBusy(true);
    try {
      if (!(await verifyAdmin(currentUser))) {
        await db.auth.signOut(); currentUser = null; editor.hidden = true; login.hidden = false;
        say("انتهت صلاحية المشرف أو لم يعد الحساب مخولاً."); return;
      }
      const title = $("title").value.trim(), content = $("content").value.trim();
      const file = $("coverFile").files[0]; let cover = $("coverUrl").value.trim() || null;
      if (!title || !content) { say("العنوان والمحتوى مطلوبان."); return; }
      if (file) {
        if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) { say("نوع الصورة غير مدعوم. استخدم JPG أو PNG أو WebP."); return; }
        if (file.size > 5 * 1024 * 1024) { say("حجم الصورة يتجاوز 5 ميغابايت."); return; }
        const cleanName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const path = currentUser.id + "/" + Date.now() + "-" + cleanName;
        say("جارٍ رفع الصورة...");
        const { error: uploadError } = await db.storage.from("post-images").upload(path, file, { upsert: false, contentType: file.type });
        if (uploadError) { say("فشل رفع الصورة: " + uploadError.message); return; }
        const { data: publicData } = db.storage.from("post-images").getPublicUrl(path); cover = publicData.publicUrl;
      }
      const slug = "post-" + Date.now().toString(36);
      const { error } = await db.from("posts").insert({ title, content, cover_url: cover, slug, published_at: new Date().toISOString() });
      if (error) { say("فشل حفظ المنشور: " + error.message); return; }
      $("title").value = ""; $("content").value = ""; $("coverFile").value = ""; $("coverUrl").value = "";
      say("تم نشر المنشور بنجاح."); await refresh();
    } catch (e) { console.error(e); say("حدث خطأ غير متوقع أثناء النشر."); }
    finally { setBusy(false); }
  });
  db.auth.onAuthStateChange(event => {
    if (event === "PASSWORD_RECOVERY") { showRecovery(); return; }
    if (event === "SIGNED_OUT") { currentUser = null; if (!recoveryMode) { login.hidden = false; editor.hidden = true; } }
  });
  if (location.hash.includes("error_code=")) say("رابط الاستعادة غير صالح أو منتهي الصلاحية. اطلب رابطاً جديداً.");
  else if (recoveryMode) showRecovery();
  showSession().catch(error => { console.error(error); say("تعذر تهيئة لوحة الإدارة."); });
})();
