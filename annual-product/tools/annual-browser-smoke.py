"""Check the annual Studio flow using a virtual browser clock."""
import argparse
from datetime import datetime, timezone
from pathlib import Path
from playwright.sync_api import expect, sync_playwright

MINUTES = 60_000

def snapshot(page, folder, name):
    if folder:
        folder.mkdir(parents=True, exist_ok=True)
        page.screenshot(path=folder/(name+".png"), full_page=not page.locator("#archive").is_visible())

def open_index(page):
    page.locator("#history").click()
    expect(page.locator("#journal-prose p").first).to_be_visible()
    page.locator("#journal-index > summary").click()

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("url")
    parser.add_argument("--screenshots", type=Path)
    args=parser.parse_args()
    with sync_playwright() as pw:
        browser=pw.chromium.launch(channel="chrome")
        ctx=browser.new_context(viewport={"width":1280,"height":820},permissions=["clipboard-read","clipboard-write"])
        ctx.clock.install(time=datetime(2026,6,1,8,tzinfo=timezone.utc))
        pg=ctx.new_page()
        errors=[]
        pg.on("pageerror",lambda e:errors.append(str(e)))
        pg.goto(args.url)
        pg.locator("#setup").wait_for()
        assert pg.locator("#mbti option").count()==17
        pg.locator("#traveler-nav").click();expect(pg.locator("#profile-empty")).to_be_visible()
        pg.locator("#history").click();expect(pg.locator("#library")).to_be_hidden()
        pg.locator("#home").click()
        snapshot(pg,args.screenshots,"01-从北京出发")
        pg.select_option("#mbti","ESFP")
        pg.select_option("#gender","男")
        pg.locator("#begin").click()
        pg.locator("#focus").wait_for()
        ctx.clock.fast_forward(3*MINUTES)
        pg.locator("#main-action").click()
        expect(pg.locator("#main-action")).to_have_text("继续专注")
        stopped=pg.locator("#timer").inner_text()
        ctx.clock.fast_forward(40*MINUTES)
        pg.reload()
        expect(pg.locator("#timer")).to_have_text(stopped)
        pg.locator("#history").click()
        expect(pg.locator("#archive-empty")).to_be_visible()
        pg.locator("#home").click()
        pg.locator("#main-action").click()
        expect(pg.locator("#main-action")).to_have_text("暂停专注")
        pg.locator("#cancel").click()
        expect(pg.locator("#timer")).to_have_text("25:00")
        pg.locator("#history").click()
        expect(pg.locator("#archive-empty")).to_be_visible()
        pg.locator("#home").click()
        pg.locator("#main-action").click()
        expect(pg.locator("#main-action")).to_have_text("暂停专注")
        ctx.clock.fast_forward(MINUTES)
        snapshot(pg,args.screenshots,"02-专注中")
        other=ctx.new_page()
        other.goto(args.url);other.locator("#focus").wait_for()
        expect(other.locator("#main-action")).to_have_text("暂停专注")
        other.locator("#traveler-nav").click()
        ctx.clock.fast_forward(24*MINUTES+1000)
        expect(pg.locator("#reading-title")).to_have_text("第 1 次专注")
        expect(other.locator("#reading-title")).to_have_text("第 1 次专注")
        pg.locator("#prose .body").first.wait_for()
        assert "北京" in pg.locator("#prose").inner_text()
        snapshot(pg,args.screenshots,"03-第一次回来")
        pg.locator("#account summary").click()
        assert "余额" in pg.locator("#balance").inner_text()
        pg.locator("#copy").click()
        expect(pg.locator("#status")).to_have_text("已复制这段故事。")
        copied=pg.evaluate("navigator.clipboard.readText()")
        assert "ESFP" in copied and "第 1 次专注" in copied
        other.close()
        pg.locator("#again").click()
        expect(pg.locator("#main-action")).to_have_text("暂停专注")
        pg.close()
        ctx.clock.fast_forward(3*24*60*MINUTES)
        pg=ctx.new_page();pg.goto(args.url)
        expect(pg.locator("#reading-title")).to_have_text("第 2 次专注")
        for n in range(3,6):
            pg.locator("#again").click()
            pg.locator("#focus").wait_for()
            ctx.clock.fast_forward(25*MINUTES+100)
            expect(pg.locator("#reading-title")).to_have_text("第 "+str(n)+" 次专注")
        pg.locator(".night").wait_for()
        assert "睡眠 8 小时" in pg.locator(".night").inner_text()
        pg.set_viewport_size({"width":390,"height":844})
        snapshot(pg,args.screenshots,"04-手机跨夜阅读")
        assert pg.evaluate("document.documentElement.scrollWidth<=innerWidth")
        pg.locator("#history").click()
        expect(pg.locator("#journal-prose h2")).to_have_count(2)
        expect(pg.locator("#saved")).to_be_hidden()
        # Compare every paragraph with the unlocked source, including the morning in receipt five.
        cards=pg.request.get(args.url.split("/annual")[0]+"/api/v1/annual/ESFP").json()
        expected=[part.strip().replace("小禾","小川").replace("{称呼}","小伙子")
                  for w in cards[:5] for e in w["events"] for part in e["text"].splitlines() if part.strip()]
        assert pg.locator("#journal-prose p").all_text_contents()==expected
        pg.locator("#journal-index > summary").click()
        expect(pg.locator("#saved")).to_have_attribute("max","5")
        pg.fill("#saved","1");pg.locator("#open-saved").click()
        expect(pg.locator("#reading-title")).to_have_text("第 1 次专注")
        pg.locator("#home").click();pg.locator("#latest-story").click();expect(pg.locator("#reading-title")).to_have_text("第 5 次专注")
        # A failed read does not consume a second receipt. Retry the same unlocked page.
        pg.route("**/api/v1/annual/*",lambda route:route.abort())
        pg.reload()
        pg.locator("#retry").wait_for()
        expect(pg.locator("#foot")).to_have_text("已完成 5 / 1752 次专注")
        pg.unroute("**/api/v1/annual/*")
        pg.locator("#retry").click()
        pg.locator("#prose .body").first.wait_for()
        expect(pg.locator("#status")).to_be_empty()
        expect(pg.locator("#reading-title")).to_have_text("第 5 次专注")
        for width in (320,390,650,768,1024,1440):
            pg.set_viewport_size({"width":width,"height":800})
            assert pg.evaluate("document.documentElement.scrollWidth<=innerWidth"),width
        # Start at the penultimate saved receipt to exercise normal year-end navigation.
        pg.evaluate('''async () => {
          const db = await new Promise((resolve,reject) => {
            const req=indexedDB.open('parallel-life-annual-v1');
            req.onsuccess=()=>resolve(req.result); req.onerror=()=>reject(req.error);
          });
          await new Promise((resolve,reject) => {
            const tx=db.transaction('journey','readwrite');
            tx.objectStore('journey').put({type:'ESFP',gender:'男',unlocked:1751,
              remaining:1500000,deadline:null,id:null},'current');
            tx.oncomplete=resolve;tx.onerror=reject;
          });db.close();
        }''')
        pg.goto(args.url)
        expect(pg.locator("#reading-title")).to_have_text("第 1751 次专注")
        pg.locator("#again").click();pg.locator("#focus").wait_for()
        ctx.clock.fast_forward(25*MINUTES+100)
        expect(pg.locator("#reading-title")).to_have_text("第 1752 次专注")
        pg.locator("#prose .body").first.wait_for()
        assert pg.locator("#again").is_hidden()
        open_index(pg);expect(pg.locator("#saved")).to_have_attribute("max","1752")
        expect(pg.locator("#journal-prose h2")).to_have_count(365)
        pg.select_option("#journal-day",index=365)
        expect(pg.locator("#journal-prose h2").last).to_be_focused()
        pg.locator("#journal-index > summary").click()
        pg.select_option("#kind","test");expect(pg.locator("#entries li")).to_have_count(0)
        pg.select_option("#kind","");pg.select_option("#month",index=1)
        expect(pg.locator("#entries li")).to_have_count(6)
        pg.locator("#next").click();expect(pg.locator("#list-info")).to_contain_text("第 2 /")
        pg.set_viewport_size({"width":1280,"height":820})
        snapshot(pg,args.screenshots,"桌面-旅途手记")
        pg.fill("#saved","1");pg.locator("#open-saved").click()
        expect(pg.locator("#reading-title")).to_have_text("第 1 次专注")
        assert pg.locator("#again").is_hidden()
        # The legacy male save uses the new default without losing its bookmark.
        expect(pg.locator("#volume")).to_contain_text("小川")
        assert pg.locator("#test-next").is_hidden()
        mobile=browser.new_context(viewport={"width":390,"height":844},is_mobile=True,has_touch=True,
                                   permissions=["clipboard-read","clipboard-write"])
        phone=mobile.new_page();phone.on("pageerror",lambda e:errors.append(str(e)))
        phone.goto(args.url);phone.locator("#setup").wait_for()
        for width in (320,390,650,768,1024,1440):
            phone.set_viewport_size({"width":width,"height":844})
            assert phone.evaluate("document.documentElement.scrollWidth<=innerWidth"),width
            assert phone.locator(".illustration").bounding_box()["height"]>=180
        phone.set_viewport_size({"width":390,"height":844})
        phone.select_option("#gender","男")
        expect(phone.locator("#hero-name")).to_have_text("小川")
        phone.select_option("#mbti","ISTJ")
        phone.fill("#nickname","知秋")
        snapshot(phone,args.screenshots,"05-手机出发")
        assert phone.locator("#test-depart").bounding_box()["y"]+44<=844
        phone.locator("#test-depart").click()
        expect(phone.locator("#reading-title")).to_have_text("第 1 段 · 测试试读")
        expect(phone.locator("#prose")).to_contain_text("知秋")
        expect(phone.locator("#prose")).to_contain_text("小伙子")
        assert "小禾" not in phone.locator("#prose").inner_text()
        phone.locator("#test-next").click()
        expect(phone.locator("#foot")).to_contain_text("测试试读 2 段")
        open_index(phone);phone.fill("#saved","1");phone.locator("#open-saved").click()
        phone.locator("#traveler-nav").click();phone.reload()
        expect(phone.locator("#traveler-title")).to_be_visible()
        phone.locator("#edit-name").click();phone.fill("#saved-name","林$&")
        phone.locator("#profile-form .primary").click()
        expect(phone.locator("#profile-name")).to_have_text("林$&")
        phone.go_back();expect(phone.locator("#reading-title")).to_contain_text("第 1 段")
        expect(phone.locator("#prose")).to_contain_text("林$&")
        phone.locator("#copy").click()
        copied=phone.evaluate("navigator.clipboard.readText()")
        assert "林$&" in copied and "知秋" not in copied and "小禾" not in copied
        phone.reload();expect(phone.locator("#volume")).to_contain_text("林$&")
        phone.locator("#again").click();phone.locator("#main-action").click()
        expect(phone.locator("#main-action")).to_have_text("继续专注")
        phone.locator("#test-focus").click()
        expect(phone.locator("#foot")).to_have_text("已完成 0 次专注 · 测试试读 3 段")
        mobile.clock.install()
        phone.locator("#again").click();phone.locator("#focus").wait_for()
        mobile.clock.fast_forward(25*MINUTES+100)
        expect(phone.locator("#foot")).to_have_text("已完成 1 次专注 · 测试试读 3 段")
        expect(phone.locator("#reading-title")).to_have_text("第 4 段 · 专注完成")
        phone.locator("#traveler-nav").click()
        expect(phone.locator("#focus-count")).to_have_text("1 次")
        expect(phone.locator("#focus-time")).to_have_text("25 分钟")
        expect(phone.locator("#test-count")).to_have_text("3 段")
        phone.locator("#edit-name").click();phone.fill("#saved-name","知秋");phone.locator("#profile-form .primary").click()
        expect(phone.locator("#profile-name")).to_have_text("知秋")
        snapshot(phone,args.screenshots,"手机-旅人档案")
        open_index(phone)
        expect(phone.locator("#journal-prose")).to_contain_text("知秋")
        assert phone.evaluate("document.documentElement.scrollWidth<=innerWidth")
        phone.select_option("#kind","focus")
        expect(phone.locator("#entries li")).to_have_count(1)
        phone.select_option("#kind","test")
        expect(phone.locator("#entries li")).to_have_count(3)
        phone.select_option("#kind","");snapshot(phone,args.screenshots,"手机-旅途手记")
        phone.goto(args.url+"#story/9999")
        expect(phone.locator("#reading-title")).to_have_text("第 4 段 · 专注完成")
        mobile.close()
        # Replay the reader's actual INFP example in a separate phone-sized save.
        demo=browser.new_context(viewport={"width":390,"height":844},accept_downloads=True)
        page=demo.new_page();page.on("pageerror",lambda e:errors.append(str(e)))
        page.goto(args.url);page.select_option("#mbti","INFP");page.fill("#nickname","Sherlock")
        page.locator("#test-depart").click()
        for n in range(1,12):
            expect(page.locator("#reading-title")).to_contain_text("第 "+str(n)+" 段")
            page.locator("#test-next").click()
        expect(page.locator("#scene-art")).to_have_attribute("src","/annual-scenes/kitchen.webp")
        expect(page.locator("#prose")).to_contain_text("番茄蛋羹")
        page.locator("#share-card").click()
        expect(page.locator("#save-picture")).to_be_visible()
        assert page.locator("#share-preview").evaluate("(i)=>i.complete && i.naturalWidth===1080 && i.naturalHeight>=1350")
        assert page.evaluate("document.documentElement.scrollWidth<=innerWidth")
        with page.expect_download() as saved:
            page.locator("#save-picture").click()
        assert saved.value.suggested_filename=="平行人生-INFP-12.png"
        if args.screenshots:
            saved.value.save_as(args.screenshots/"06-武汉厨房分享卡.png")
        page.locator("#share-close").click()
        open_index(page);page.fill("#saved","1");page.locator("#open-saved").click()
        expect(page.locator("#scene-art")).to_have_attribute("src","/annual-scenes/journey.webp")
        page.route("**/annual-scenes/journey.webp",lambda req:req.abort())
        # An image failure leaves the actual text and reading progress available.
        page.reload()
        open_index(page);page.fill("#saved","1");page.locator("#open-saved").click()
        page.locator("#share-card").click()
        expect(page.locator("#share-message")).to_contain_text("未生成")
        page.locator("#share-close").click()
        expect(page.locator("#prose")).to_contain_text("Sherlock")
        page.unroute("**/annual-scenes/journey.webp")
        # Compare real published windows on both sides of the bookshop / pet-care transition.
        seed_story="""async type => {
            const db=await new Promise(resolve=>{const r=indexedDB.open('parallel-life-annual-v1');r.onsuccess=()=>resolve(r.result)});
            await new Promise((resolve,reject)=>{
                const tx=db.transaction('journey','readwrite'), store=tx.objectStore('journey');
                const r=store.get('current');r.onsuccess=()=>store.put({...r.result,type,unlocked:1244},'current');
                tx.oncomplete=resolve;tx.onabort=reject;
            });db.close();
        }"""
        scenarios=[("INFJ",841,"bookshop"),("INFJ",856,"pet"),("ESFP",185,"plum"),
                   ("ESFP",227,"tofu"),("ISTP",641,"football"),("ISFJ",1244,"bicycle")]
        for mbti,number,scene in scenarios:
            page.evaluate(seed_story,mbti)
            page.reload()
            open_index(page);page.fill("#saved",str(number));page.locator("#open-saved").click()
            expect(page.locator("#scene-art")).to_have_attribute("src","/annual-scenes/"+scene+".webp")
            page.locator("#share-card").click()
            expect(page.locator("#save-picture")).to_be_visible()
            with page.expect_download() as picture:
                page.locator("#save-picture").click()
            assert picture.value.suggested_filename=="平行人生-"+mbti+"-"+str(number)+".png"
            if args.screenshots:
                picture.value.save_as(args.screenshots/(mbti+"-"+str(number)+"-"+scene+".png"))
            page.locator("#share-close").click()
        demo.close()
        # Save a direction between receipts, follow its actual branch and reopen its evidence.
        personal=browser.new_context(viewport={"width":390,"height":844})
        reader=personal.new_page()
        reader.on("pageerror",lambda e:errors.append(str(e)))
        reader.goto(args.url);reader.select_option("#mbti","INFP");reader.fill("#nickname","阿予")
        reader.locator("#test-depart").click()
        reader.locator("#prose .body").first.wait_for()
        opening=reader.locator("#prose").inner_text()
        reader.locator("#traveler-nav").click();reader.select_option("#direction","S")
        reader.fill("#preference-note","留意街上的小细节")
        reader.locator("#preference-form button").click()
        expect(reader.locator("#preferences")).to_contain_text("第 2 段起")
        expect(reader.locator("#decisions li")).to_have_count(0)
        expect(reader.locator("#growth-axes li")).to_have_count(4)
        axis=reader.locator("#growth-axes li").nth(1)
        expect(axis).to_contain_text("S 实感 46")
        expect(axis).to_contain_text("N 直觉 54")
        expect(axis).to_contain_text("与出发时相同")
        reader.reload();expect(reader.locator("#preferences")).to_contain_text("留意街上的小细节")
        reader.locator("#home").click();reader.locator("#latest-story").click()
        expect(reader.locator("#prose")).to_have_text(opening,use_inner_text=True)
        for n in range(2,11):
            reader.locator("#test-next").click()
            expect(reader.locator("#reading-title")).to_contain_text("第 "+str(n)+" 段")
        reader.locator("#traveler-nav").click()
        reader.select_option("#decision-filter","2-S")
        expect(reader.locator("#decisions")).to_contain_text("这条偏好改变了决定")
        expect(axis).to_contain_text("S 实感 47")
        expect(axis).to_contain_text("N 直觉 53")
        expect(axis).to_contain_text("出发时 S 46 / N 54")
        expect(axis).to_contain_text("向 S 移动 1 分")
        expect(reader.locator("#decisions")).to_contain_text("S 实感 46 → 47（+1 分）")
        expect(reader.locator("#decisions")).to_contain_text("留意街上的小细节")
        assert reader.evaluate("document.documentElement.scrollWidth<=innerWidth")
        reader.locator("#decisions a").first.click()
        expect(reader.locator("#reading-title")).to_contain_text("第 10 段")
        reader.locator("#history").click()
        expect(reader.locator("#journal-prose")).to_contain_text("三口冒热气的大锅")
        personal.close()
        assert not errors,errors
        print("Browser-clock tests passed: create, pause, reload, cancel, two tabs, closed page, next focus, history, copy, finance, sleep, six screen widths, retry after a failed story request, and end-of-year archive.")
        browser.close()

if __name__=="__main__":
    main()
