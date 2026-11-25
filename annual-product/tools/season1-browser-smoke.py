"""Exercise the 45-part season through its public timer, offline reader and archive."""
from argparse import ArgumentParser
from pathlib import Path
import re
from time import monotonic

from playwright.sync_api import expect, sync_playwright


parser = ArgumentParser()
parser.add_argument("url", help="Local public reader, for example http://localhost:4317/season1")
parser.add_argument("--realtime", action="store_true", help="Let one normal 25-minute focus run without a fake clock")
parser.add_argument("--sample-card", type=Path, help="Keep the selected decision's real exported PNG")
parser.add_argument("--sample-dir", type=Path, help="Keep one real illustrated card from each city")
args = parser.parse_args()
public = args.url.rstrip("/")
editor = public + "-editor"
product = Path(__file__).resolve().parents[1]
offline = product / "第一季·南下十五日试读.html"
release = product / "南下十五日" / "index.html"

# Follow visible choices, so changing their order cannot silently change the story we review.
reader_choices = {
    5: "这回你找别人", 10: "把采访原稿", 14: "把钥匙放回信箱",
    18: "我答应顶这个晚班", 22: "今晚咱俩一起换", 26: "我想自己逛", 32: "我想坐回画凳",
    34: "床钱付 70", 40: "让何姐讲自己的票袋", 43: "把整页抽掉。我想", 44: "回武汉",
}
preview_pref = "蒸糕要先量好水"
desk_quote = "陈渡父亲把交接号念到最后一位，又叫儿子照着照片核了一遍。"
carry_quote = "你先把底片送到，我去问老板要一勺热汤。"
errors = []


def tab(context, url):
    page = context.new_page()
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto(url)
    return page


def setup(page, name, skip=False, current=True):
    depart = page.locator("#depart")
    expect(depart).to_be_enabled()
    depart.click()
    expect(page.locator("#setup-sheet")).to_be_visible()
    page.keyboard.press("Escape")
    expect(depart).to_be_focused()
    depart.click()
    form = page.locator("#setup")
    form.locator("[name=nickname]").fill(name)
    form.locator("[name=type]").select_option("INFP")
    if current:
        expect(form.get_by_role("button", name="跳过专注试读")).to_have_count(0)
        form.get_by_role("button", name="先读序章", exact=True).click()
        progress(page, 0)
        expect(page.locator("#intro")).to_contain_text("三只杯盖")
        expect(page.locator("#intro")).to_contain_text("两千六百")
        expect(page.locator("#timer")).to_have_count(0)
        if skip:
            page.locator("#stage").get_by_role("button", name="跳过专注试读", exact=True).click()
        else:
            page.locator("#stage").get_by_role("button", name="开始第一次专注", exact=True).click()
            expect(page.locator("#timer")).to_be_visible()
    elif skip:
        form.get_by_role("button", name="跳过专注试读", exact=True).click()
    else:
        form.locator("button:not([name=preview]):not([type=button])").click()
        # Some editions show their free opening between saving the profile and starting the clock.
        intro = page.locator("#stage").get_by_role("button", name=re.compile("开始.*专注"))
        expect(page.locator("#timer").or_(intro)).to_be_visible()
        if intro.is_visible():
            if current:
                expect(page.locator("#intro")).to_contain_text("三只杯盖")
            intro.click()
        expect(page.locator("#timer")).to_be_visible()


def progress(page, n, total=45):
    expect(page.locator("#summary")).to_contain_text(f"已读 {n} / {total} 段")


def nav(page, name):
    page.get_by_role("navigation").get_by_role("link", name=name, exact=True).click()


def choose(page, label):
    images = page.locator(".choice button > img")
    expect(images).to_have_count(page.locator(".choice button").count())
    assert images.evaluate_all("(list) => Promise.all(list.map(img => img.decode())).then(() => list.every(img => img.naturalWidth && img.offsetWidth))")
    options = page.locator(".choice").get_by_role("button", name=re.compile(label))
    expect(options).to_have_count(1)
    options.click()
    expect(page.locator(".choice")).to_have_count(0)


def fits(page):
    assert page.evaluate("document.documentElement.scrollWidth <= innerWidth"), "horizontal overflow"


def timer_home(browser, url, width, height, minutes):
    context = browser.new_context(viewport={"width": width, "height": height}, offline=url.startswith("file:"))
    context.clock.install()
    page = tab(context, url)
    start = page.get_by_role("button", name="开始专注", exact=True)
    expect(start).to_be_enabled()
    expect(page.locator("#ready-time")).to_have_text("25:00")
    assert page.evaluate("""() => {
        const elements = ['#ready-time', '#home-duration', '#depart'].map(s => document.querySelector(s));
        const navTop = document.querySelector('nav').getBoundingClientRect().top;
        return scrollY === 0 && elements.every(el => {
            const r = el.getBoundingClientRect();
            return r.top >= 0 && r.bottom <= navTop &&
                el.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2));
        });
    }"""), "timer, duration and start must all be reachable on first paint"
    page.locator("#open-guide").click()
    expect(page.locator("#guide-sheet")).to_contain_text("50 分钟")
    page.locator("#close-guide").click()
    page.locator(".duration-options label").filter(has_text=f"{minutes} 分钟").click()
    expect(page.locator("#ready-time")).to_have_text(f"{minutes}:00")
    expect(page.locator("#focus-reward")).to_contain_text("《北京西站，开往武汉》")
    expect(page.locator("#focus-reward")).to_contain_text("读两章" if minutes == 50 else "25 分钟")
    start.click()
    expect(page.locator("#timer")).to_have_count(0)
    page.locator("#close-setup").click()
    expect(start).to_be_focused()
    start.click()
    page.get_by_role("button", name=f"开始 {minutes} 分钟专注", exact=True).click()
    expect(page.locator(".clock-mode")).to_contain_text(f"{minutes} 分钟")
    expect(page.locator("#timer")).to_be_visible()
    context.clock.fast_forward(minutes * 60_000 + 1000)
    progress(page, minutes // 25)
    expect(page.locator("#intro")).to_contain_text("三只杯盖")
    expect(page.locator("#stage .current-chapter")).to_have_count(minutes // 25)
    expect(page.locator("#stage .next-chapter")).to_contain_text("借住的第一顿饭" if minutes == 50 else "对座漏下的纸袋")
    nav(page, "旅途手记")
    expect(page.locator("#book-pages .next-chapter")).to_have_text(page.locator("#stage .next-chapter").text_content())
    page.locator("#book-pages .reading-start").click()
    expect(page.locator("#timer")).to_be_visible()
    page.get_by_role("button", name="取消本次").click()
    back = tab(context, url)
    expect(back.locator("#depart")).to_have_text("开始专注")
    rect = back.locator("#depart").bounding_box()
    assert rect["y"] + rect["height"] <= back.locator("nav").bounding_box()["y"]
    back.locator("#depart").click()
    expect(back.locator("#timer")).to_be_visible()
    expect(back.locator("#setup-sheet")).not_to_be_visible()
    fits(page)
    context.close()
    print(f"timer home {width}x{height}: {minutes} min, opening, reward and returning start passed")


def share_from_archive(page, n, expected_quote, unchosen_quote=None, output=None):
    # Record the text actually painted to the exported canvas, including lines wrapped by the renderer.
    # The note body beside the PNG is independent and could otherwise mask a wrong or truncated card.
    page.evaluate("""() => {
        if (!window.__seasonShareLines) {
          const original = CanvasRenderingContext2D.prototype.fillText;
          CanvasRenderingContext2D.prototype.fillText = function (str, ...args) {
            if (this.canvas.width === 1080 && this.canvas.height === 1440)
              window.__seasonShareLines.push(String(str));
            return original.call(this, str, ...args);
          };
        }
        window.__seasonShareLines = [];
    }""")
    entry = page.locator(f"#entry-{n}")
    expect(entry).to_contain_text(expected_quote)
    paragraphs = entry.locator(".prose").all_text_contents()
    details = page.locator("#archive-share")
    if not details.evaluate("(e) => e.open"):
        details.locator("summary").click()
    page.locator("#share-entry").select_option(str(n))
    page.locator("#book-share").click()
    expect(page.locator("#save-share")).to_be_visible()
    expect(page.locator("#save-share")).to_have_attribute("download", f"南下十五日-第{n}段.png")
    assert page.locator("#share-img").evaluate(
        "(i) => i.decode().then(() => [i.naturalWidth, i.naturalHeight])"
    ) == [1080, 1440]
    href = page.locator("#save-share").get_attribute("href")
    assert href.startswith("data:image/png;base64,")
    flat = lambda prose: "".join(prose.split())
    copied = page.locator("#share-text").input_value()
    assert flat(copied) == flat("".join(paragraphs)), "The archive and copied note disagree"
    painted = "".join(page.evaluate("window.__seasonShareLines"))
    assert expected_quote in painted, f"Missing chosen quote on poster: {expected_quote}"
    if unchosen_quote:
        assert unchosen_quote not in painted and unchosen_quote not in copied
    if output:
        with page.expect_download() as download:
            page.locator("#save-share").click()
        download.value.save_as(output)
    page.get_by_role("button", name="关闭", exact=True).click()


def read_preview(browser, url, full):
    context = browser.new_context(viewport={"width": 390 if full else 1200, "height": 844})
    context.set_offline(url.startswith("file:"))
    page = tab(context, url)
    setup(page, "南山", skip=True)
    progress(page, 1)
    opener = page.locator("#stage .chapter-illustration")
    expect(opener).to_have_attribute("data-scene", "room")
    assert opener.evaluate("(img) => img.decode().then(() => img.naturalWidth > 0)")
    expect(page.locator(".reading-recap")).to_have_count(0)
    expect(page.locator(".first-preference")).to_contain_text("遇到合适的事，旅人可能会照着做")
    page.locator(".first-preference a").click()
    expect(page.locator("#pref select")).to_be_focused()
    expect(page.locator("#identity")).to_contain_text("真实专注 0 次 · 0 分钟")
    page.locator("#pref select").select_option("S")
    page.locator("#pref input").fill(preview_pref)
    page.locator("#pref button").click()
    expect(page.locator("#prefs")).to_contain_text(preview_pref)
    expect(page.locator("#pref-status")).to_contain_text("记下了")
    page.locator("#pref select").select_option("T")
    page.locator("#pref input").fill("交接清楚一点")
    page.locator("#pref button").click()
    expect(page.locator("#prefs")).to_contain_text("交接清楚一点")
    page.locator("#back-to-story").click()
    finish = 45 if full else 7
    picks = {**reader_choices, 18: "把纸裁了", 22: "七十五我转给你", 34: "搬去后院通铺", 44: "继续向西"} if full else reader_choices
    for n in range(2, finish + 1):
        page.get_by_role("button", name="跳过专注试读", exact=True).click()
        progress(page, n)
        if n == 34:
            expect(page.locator(".choice button")).to_have_count(3)
            expect(page.get_by_role("button", name=re.compile("四晚付 280"))).to_contain_text("还差 10 元")
            expect(page.get_by_role("button", name=re.compile("搬去后院通铺"))).to_contain_text("订好还能余 140 元")
            page.reload()
            progress(page, 34)
        if n in picks:
            choose(page, picks[n])
        if n == 35:
            page.locator("#stage .pref-link").click()
            page.locator("#pref select").select_option("E")
            page.locator("#pref input").fill("坐下来问问他的事")
            page.locator("#pref button").click()
            page.locator("#back-to-story").click()
        if n == 36:
            expect(page.locator("#stage .current-chapter")).to_contain_text("澡盆照")
            expect(page.locator(".pref-echo")).to_contain_text("坐下来问问他的事")
            page.locator(".pref-echo a").click()
            expect(page.locator("#decision-36-key")).to_contain_text("南山自己决定")
            nav(page, "专注")
        if n == 37:
            expect(page.locator("#stage .current-chapter")).to_contain_text("通铺")
        if n == 2:
            expect(page.locator(".choice")).to_have_count(0)
            expect(page.locator("#stage")).to_contain_text(desk_quote)
            page.locator(".pref-echo a").click()
            expect(page.locator("#decision-2-key")).to_contain_text("交接清楚一点")
            nav(page, "专注")
            expect(page.locator("#intro")).to_be_empty()
            recap = page.locator(".reading-recap")
            recap.locator("summary").click()
            expect(recap).to_contain_text("唐青")
            expect(recap).not_to_contain_text("交接号")
            expect(recap).not_to_contain_text("许兰")
            recap.locator("summary").click()
        if n == 4:
            expect(page.locator(".pref-echo")).to_contain_text(preview_pref)
            page.locator(".pref-echo a").click()
            expect(page.locator("#decision-4-daily")).to_be_focused()
            expect(page.locator("#decision-4-daily")).to_contain_text(preview_pref)
            nav(page, "专注")
        if n == 7:
            recap = page.locator(".reading-recap")
            recap.locator("summary").click()
            expect(recap).to_contain_text("推掉老周")
            expect(recap).to_contain_text("分吃第一笼糕")
        if n in (6, 33):
            scene = "ricecake" if n == 6 else "street"
            expect(opener).to_have_attribute("data-scene", scene)
            assert opener.evaluate("(img) => img.decode().then(() => img.naturalWidth > 0)")
        if n == 44:
            expect(page.locator("#stage .current-chapter")).to_contain_text("陈渡")
    page.reload()
    progress(page, finish)
    nav(page, "旅人档案")
    identity = page.locator("#identity")
    expect(identity).to_contain_text("真实专注 0 次 · 0 分钟")
    expect(identity).to_contain_text(f"测试试读 {finish} 段")
    expect(page.locator("#keepsakes")).to_contain_text("纸袋的领取回执")
    expect(page.locator('#history .decision-note').filter(has=page.locator('a[href="#entry-4"]'))).to_contain_text(preview_pref)
    page.locator('#history a[href="#entry-4"]').click()
    expect(page.locator("#entry-4")).to_contain_text("蒸屉边有一圈旧水印")
    expect(page.locator("#book-pages div[id^=entry-]")).to_have_count(finish)
    expect(page.locator("#book-pages .book-chapter h3")).to_have_count(finish)
    expect(page.locator("#entry-1 .book-part")).to_have_text("早上 · 北京 → 武汉")
    expect(page.locator("#entry-2 .book-part")).to_have_text("午后 · 北京 → 武汉")
    expect(page.locator("#book-day-1")).to_have_text("6月1日 · 北京 → 武汉")
    expect(page.locator("#entry-3 .book-part")).to_have_text("夜里 · 武汉")
    expect(page.locator("#entry-6 h3")).to_have_text("靠背的那两把椅子")
    expect(page.locator("#book-pages")).to_contain_text(re.compile("两千六百|2,?600"))
    picker = page.get_by_label("跳到旅途日期")
    last_day = (finish + 2) // 3
    expect(picker.locator("option")).to_have_count(last_day + 1)
    picker.select_option("book-day-" + str(last_day))
    heading = page.locator("#book-day-" + str(last_day))
    expect(heading).to_be_focused()
    expect(heading).to_be_in_viewport()
    if full:
        nav(page, "旅人档案")
        expect(page.locator("#prefs")).to_contain_text(preview_pref)
        expect(page.locator("#pref")).to_be_hidden()
        expect(page.locator("#prefs").get_by_role("button", name="移除")).to_have_count(0)
        expect(page.locator("#settings")).to_contain_text("这趟旅程已经结束")
        for n in (2, 28, 34, 36, 43, 44):
            card = page.locator(f"#decision-{n}-key")
            expect(card).to_have_class(re.compile("decision-note"))
            expect(card.locator("a")).to_have_attribute("href", f"#entry-{n}")
            expect(card.locator("details")).to_have_count(0)
            assert 3 < len(card.locator("p").inner_text()) < 65
        page.locator("#decision-43-key a").click()
        expect(page.locator("#entry-43")).to_be_focused()
        for title in ("邱婆婆打的皮拉环", "折在本子里的空白展签", "留到下回的扁石头", "锣槌上的红棉布"):
            expect(page.locator("#keepsakes")).to_contain_text(title)
        expect(page.locator("#entry-45")).to_contain_text("往贵阳的车")
        nav(page, "旅人档案")
        map_link = page.locator("#keepsakes .souvenir").filter(has_text="三口蒸锅")
        expect(map_link).to_have_attribute("href", "#entry-44")
        map_link.click()
        expect(page.locator("#entry-44")).to_be_focused()
        expect(page.locator("#entry-14")).to_contain_text("咱们拍张三个人的")
        share_from_archive(page, 14, "下回来武汉，咱们拍张三个人的，让邱婆婆按快门。")
        for n, quote, title in [
            (6, "我就想留张你吃我做的东西的样子。", "武汉米糕"),
            (25, "那下回咱们少逞一回能。粉快吃，坨了。", "长沙印店"),
            (39, "从前满船的人都喊我‘卖票的’。这回把我的名字写全了啊。", "阳朔票袋"),
        ]:
            target = args.sample_dir / f"分享样图-{title}.png" if args.sample_dir else None
            share_from_archive(page, n, quote, output=target)
    share_from_archive(page, 2, desk_quote, carry_quote, output=args.sample_card if full else None)
    fits(page)
    if not full:
        formal = tab(context, public)
        expect(formal.locator("#depart")).to_be_visible()
        expect(formal.get_by_role("button", name="跳过专注试读")).to_have_count(0)
        nav(page, "专注")
        progress(page, finish)
    context.close()
    print(f"{'offline mobile' if full else 'online editor'}: {finish} parts, true focus count zero, archive and painted branch quote passed")


def read_formal(browser, url):
    context = browser.new_context(viewport={"width": 360, "height": 800})
    context.set_offline(url.startswith("file:"))
    context.clock.install()
    first = tab(context, url)
    expect(first.get_by_role("button", name="跳过专注试读")).to_have_count(0)
    setup(first, "行舟")
    first.get_by_role("button", name="暂停", exact=True).click()
    expect(first.get_by_role("button", name="继续计时")).to_be_visible()
    first.reload()
    resume = first.get_by_role("button", name="继续计时")
    expect(resume).to_be_visible()
    resume.click()
    expect(first.get_by_role("button", name="暂停", exact=True)).to_be_visible()
    context.clock.fast_forward(25 * 60_000 + 1000)
    progress(first, 1)
    second = tab(context, url + "?preview=1&classic=1")
    progress(second, 1)
    expect(second.get_by_role("button", name="跳过专注试读")).to_have_count(0)
    second.locator(".duration-options label").filter(has_text="50 分钟").click()
    second.get_by_role("button", name="开始下一次专注").click()
    expect(first.locator("#timer")).to_be_visible()
    context.clock.fast_forward(50 * 60_000 + 1000)
    for page in [first, second]:
        progress(page, 3)
        expect(page.locator("#stage .chapter-illustration")).to_have_count(2)
        expect(page.locator("#stage")).to_contain_text(carry_quote)
        expect(page.locator("#stage")).to_contain_text("挂历背面写了收条")
    expect(second.locator(".choice")).to_have_count(0)
    second.reload()
    progress(second, 3)
    nav(second, "旅人档案")
    expect(second.locator("#identity")).to_contain_text("真实专注 2 次 · 75 分钟")
    expect(second.locator("#identity")).not_to_contain_text("测试试读")
    expect(second.locator("#keepsakes")).to_contain_text("挂历背面的收条")
    nav(second, "旅途手记")
    expect(second.locator("#book-pages div[id^=entry-]")).to_have_count(3)
    share_from_archive(second, 2, carry_quote, desk_quote)
    fits(second)
    context.close()
    print("formal 25/50, pause/reload, two tabs, two consecutive chapters, saved automatic handoff and 3:4 poster passed")


def read_alternate_preview(browser):
    context = browser.new_context(viewport={"width": 360, "height": 780}, offline=True)
    context.clock.install()
    page = tab(context, offline.as_uri())
    setup(page, "江岸", skip=True)
    picks = {**reader_choices, 5: "我接稿", 10: "长沙印完", 14: "敲门", 26: "我来坐", 32: "都跟何姐约好了", 34: "四晚付 280", 40: "把袋底和里衬摊开"}
    skip = page.get_by_role("button", name="跳过专注试读", exact=True)
    for n in range(2, 43):
        if n in (21, 27):
            continue
        if n == 20:
            page.locator(".duration-options label").filter(has_text="50 分钟").click()
            skip.click()
            progress(page, 21)
            first, second = page.locator("#stage .current-chapter").all()
            expect(first.locator(".entry-tools details")).to_contain_text("长沙头两日餐费")
            expect(second.locator(".entry-tools details")).to_have_count(0)
            page.locator(".duration-options label").filter(has_text="25 分钟").click()
            continue
        if n == 26:
            page.locator(".duration-options label").filter(has_text="50 分钟").click()
            page.get_by_role("button", name="开始下一次专注").click()
            expect(page.locator("#timer")).to_be_visible()
            context.clock.fast_forward(50 * 60_000 + 1000)
        else:
            skip.click()
        progress(page, n)
        if n in picks:
            choose(page, picks[n])
        if n == 26:
            progress(page, 27)
            page.reload()
            first, second = page.locator("#stage .current-chapter").all()
            expect(first.locator(".turn a")).to_have_attribute("href", "#decision-26-key")
            expect(second.locator(".turn")).to_have_count(0)
            expect(second.locator(".entry-tools details")).to_contain_text("结清长沙餐费")
            for chapter, number in [(first, 26), (second, 27)]:
                chapter.locator(".entry-share").click()
                expect(page.locator("#save-share")).to_have_attribute("download", f"南下十五日-第{number}段.png")
                expect(page.locator("#share-text")).to_have_value(re.compile(chapter.locator("p.prose").first.inner_text()[:12]))
                page.locator("#close-share").click()
            first.locator(".turn a").click()
            expect(page.locator("#decision-26-key")).to_be_focused()
            nav(page, "专注")
            page.locator(".duration-options label").filter(has_text="25 分钟").click()
        if n in (6, 33):
            scene = "proof" if n == 6 else "riverstep"
            image = page.locator("#stage .chapter-illustration")
            assert image.evaluate("""(img, scene) => img.decode().then(() =>
                img.src === JSON.parse(document.querySelector('#art').textContent)[scene])""", scene)
    page.locator(".duration-options label").filter(has_text="50 分钟").click()
    skip.click()
    progress(page, 43)
    expect(page.locator(".choice")).to_contain_text("下一段已经随这次专注解锁")
    page.locator("#depart").click()
    expect(page.locator("#pending-choice")).to_be_focused()
    expect(page.locator("#timer")).to_have_count(0)
    page.reload()
    page.locator(".choice").get_by_role("button", name=re.compile("我想跟策划亲自说两句")).click()
    progress(page, 44)
    chapters = page.locator("#stage .current-chapter")
    expect(chapters).to_have_count(2)
    expect(chapters.first).to_contain_text("身后快门响过一声")
    expect(chapters.last).to_contain_text("下周有空")
    expect(chapters.last).to_contain_text("就我们爷俩留一张")
    choose(page, "回武汉")
    expect(page.locator("#home-duration")).to_be_hidden()
    expect(page.locator("#ready-time")).to_have_text("25:00")
    skip.click()
    progress(page, 45)
    page.locator("#depart").click()
    expect(page.locator("#book")).to_be_visible()
    nav(page, "旅人档案")
    expect(page.locator("#identity")).to_contain_text("真实专注 1 次 · 50 分钟")
    expect(page.locator("#identity")).to_contain_text("测试试读 43 段")
    expect(page.locator("#keepsakes .souvenir")).to_have_count(7)
    context.close()
    print("offline alternate art, timed pair 26/27 with first personality turn and separate posters, trial across 43/44, seven keepsakes passed")


def legacy_slots(browser):
    context = browser.new_context()
    context.clock.install()
    current = tab(context, public)
    expect(current.locator("#depart")).to_be_enabled()
    expect(current.locator("#previous-link")).to_be_hidden()
    old = tab(context, editor + "?classic=1")
    setup(old, "旧旅人", skip=True, current=False)
    progress(old, 1, 72)
    older = tab(context, public + "?edition=2")
    setup(older, "七十二段旅人", current=False)
    context.clock.fast_forward(25 * 60_000 + 1000)
    progress(older, 1, 72)
    reader = tab(context, editor + "?preview=1")
    expect(reader.locator("#depart")).to_be_enabled()
    reader.get_by_role("link", name="继续最早的旅程").click()
    expect(reader.locator("#summary")).to_contain_text("旧旅人的旅程 · 已读 1 / 72 段")
    reader.goto(editor + "?edition=2&preview=1")
    setup(reader, "旧试读", skip=True, current=False)
    reader.goto(editor + "?edition=3&preview=1")
    setup(reader, "第一版四十五段", skip=True, current=False)
    expect(reader.locator("#stage")).to_contain_text("还是第一版四十五段替她们刷的票")
    reader.goto(editor + "?preview=1")
    reader.get_by_role("link", name="继续上次的 72 段旅程").click()
    expect(reader.locator("#summary")).to_contain_text("旧试读的旅程 · 已读 1 / 72 段")
    reader.go_back()
    reader.get_by_role("link", name="继续上次的 45 段旅程").click()
    expect(reader.locator("#summary")).to_contain_text("第一版四十五段的旅程 · 已读 1 / 45 段")
    reader.get_by_role("button", name="跳过专注试读", exact=True).click()
    progress(reader, 2)
    reader.go_back()
    setup(reader, "新版试读", skip=True)
    expect(reader.locator("#stage")).to_contain_text("辞职")
    expect(reader.locator("#stage")).not_to_contain_text("陈渡")
    reader.get_by_role("link", name="继续上次的 45 段旅程").click()
    progress(reader, 2)
    current.reload()
    current.get_by_role("link", name="继续上次的 72 段旅程").click()
    expect(current.locator("#summary")).to_contain_text("七十二段旅人的旅程 · 已读 1 / 72 段")
    current.go_back()
    setup(current, "新旅人")
    progress(current, 0)
    old.reload()
    expect(old.locator("#summary")).to_contain_text("旧旅人的旅程 · 已读 1 / 72 段")
    older.reload()
    expect(older.locator("#summary")).to_contain_text("七十二段旅人的旅程 · 已读 1 / 72 段")
    current.reload()
    expect(current.locator("#summary")).to_contain_text("新旅人的旅程 · 已读 0 / 45 段")
    context.close()
    print("saved-only links, classic renderer, independent 72/45 saves and focus/preview isolation passed")


with sync_playwright() as pw:
    browser = pw.chromium.launch(channel="chrome")
    if args.realtime:
        context = browser.new_context()
        page = tab(context, public)
        expect(page.get_by_role("button", name="跳过专注试读")).to_have_count(0)
        started = monotonic()
        setup(page, "实测旅人")
        expect(page.locator("#summary")).to_contain_text("已读 1 / 45 段", timeout=1_530_000)
        seconds = monotonic() - started
        assert 1500 <= seconds < 1540, seconds
        nav(page, "旅人档案")
        expect(page.locator("#identity")).to_contain_text("真实专注 1 次 · 25 分钟")
        print(f"One natural timer completion after {seconds:.1f} real seconds")
        context.close()
    else:
        timer_home(browser, public, 320, 568, 25)
        timer_home(browser, release.as_uri(), 390, 844, 50)
        read_preview(browser, editor + "?preview=1", full=False)
        read_preview(browser, offline.as_uri(), full=True)
        read_alternate_preview(browser)
        for location in [public, release.as_uri()]:
            read_formal(browser, location)
        legacy_slots(browser)
    browser.close()
    assert not errors, errors
