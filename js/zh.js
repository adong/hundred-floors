/* 中文 for 100 Floors: the words on the page, the toasts and banners, the ? panel and the 3D word bursts (Kit.lang,
   from kit/lang.js). The kids' names and the game's name stay in English on purpose; the floor signs on the walls
   (B5, 10F) are the same in Chinese buildings. */
(function () {
  const L = Kit.lang;
  L.keep(['100 Floors', 'Floors', 'TEDDY', 'TOMMY', 'Teddy', 'Tommy', 'ZOOM', 'LUNA', 'BOLT', 'BRUNO', 'Claude Code', 'Esc']);

  L.add({
    // title screen
    'Go down 100 floors, or climb up 100, with Teddy & Tommy!': '和 Teddy、Tommy 一起，往下一百层，或者往上爬一百层！',
    'DOWN': '往下', 'UP': '往上', 'BEST 0': '最高 0', // (the placeholder before the game fills in the bests)
    'PICK YOUR KID': '选一个小朋友', 'Pick your kid': '选一个小朋友', 'ZOMBIE': '僵尸',
    'BUDDY · TAP ME!': '点我叫他！', 'EASY OFF': '简单 关', 'EASY ON': '简单 开', 'TILT OFF': '倾斜 关', 'TILT ON': '倾斜 开',
    'Easy mode (E): slower, wider platforms, 5 hearts': '简单模式 (E)：更慢、平台更宽、5 颗心',
    'Steer by tilting': '倾斜手机来控制方向',
    'big jump (UP)': '大跳（往上模式）', 'pick a mode,': '选模式，', 'go': '出发', 'call': '叫', 'easy': '简单', 'sound': '声音',
    'Hold the left or right side of the screen to move. In UP, tap ⤒ JUMP for a big jump. Tap':
      '按住屏幕左边或右边来移动。往上模式点 ⤒ 大跳 跳得更高。点',
    "'s face to call him!": ' 的头像，叫他来帮忙！',
    // HUD and buttons (their tooltips too)
    'hearts': '心', 'Treats': '零食', 'Combo stars': '连跳星星', 'Your buddy is guarding you': '兄弟在保护你',
    'FLOOR': '楼层', 'FLOORS DOWN': '往下层数', 'FLOORS UP': '往上层数', 'COMBO ×': '连跳 ×',
    'Pause': '暂停', 'Pause (P)': '暂停 (P)', 'Sound (M)': '声音 (M)', 'Sound on or off': '声音 开 / 关',
    'Big jump (Space)': '大跳 (空格)', 'JUMP': '大跳', 'Call your buddy (T)': '叫兄弟来帮忙 (T)',
    '◀ HOLD': '◀ 按住', 'HOLD ▶': '按住 ▶', 'GO!': '出发！',
    // toasts
    'LAST HEART!': '只剩一颗心啦！',
    // pause and game over
    '🏠 MENU': '🏠 菜单', 'P · Esc · Space': 'P · Esc · 空格',
    'PHEW!': '呼～', 'YAY!': '耶！', 'WOW!': '哇！', 'TREATS': '零食', 'COMBO STARS': '连跳星星',
    '★ NEW BEST! ★': '★ 新纪录！★', '↻ AGAIN': '↻ 再来一次', 'LOADING…': '加载中…',
    'This browser can’t run WebGL, so 100 Floors can’t start.': '这个浏览器跑不了 WebGL，100 Floors 开不了。',
    // the ? panel (js/keys.js)
    'pick a mode and go (title)': '选模式出发（标题页）',
    'Hold the left or right half of the screen to move, ⤒ JUMP in UP mode, or 📱 TILT. The big face (bottom right) calls your brother.':
      '按住屏幕左半边或右半边来移动，往上模式点 ⤒ 大跳，也可以用 📱 倾斜。点右下角的大头像叫兄弟来帮忙。',
    // the 3D word bursts (world.js, hero.js)
    'OUCH!': '哎哟！', 'BONK!': '咚！', 'BOING!': '蹦！', 'SAFE!': '没事！', 'SWISH!': '唰！',
  });

  const TREAT = { 'ICE CREAM': '冰淇淋', WATER: '水', 'JUICE BOX': '果汁', COOKIE: '饼干', WATERMELON: '西瓜', BANANA: '香蕉' };
  const who = (name) => L.t(name);
  L.rule(/^(.+)'S BEST (\d+)( 🐣)?$/, (m, n, best, egg) => `${who(n)} 最高 ${best} 层${egg || ''}`);
  L.rule(/^(.+)'S BEST( 🐣)?$/, (m, n, egg) => `${who(n)} 的最高${egg || ''}`);
  L.rule(/^(.+) SAVED YOU!$/, '$1 救了你！');
  L.rule(/^(.+)'S HERE!$/, '$1 来啦！');
  L.rule(/^Call (.+) \(T\)$/, '叫 $1 来帮忙 (T)');
  L.rule(/^(\S+) (ICE CREAM|WATER|JUICE BOX|COOKIE|WATERMELON|BANANA) FROM (.+)!$/, (m, emoji, item, from) => `${emoji} ${from} 送来的${TREAT[item]}！`);
  L.rule(/^COMBO ×(\d+)!$/, '连跳 ×$1！');
  L.rule(/^⭐ \+(\d+) COMBO STARS!$/, '⭐ +$1 颗连跳星星！');
  // the milestone banner ("★ 25 FLOORS! ★", "100 FLOORS!") and a multi-floor jump in UP ("2 FLOORS!")
  L.rule(/^★ (\d+) FLOORS! ★$/, '★ 第 $1 层啦！★');
  L.rule(/^(\d+) FLOORS!$/, (m, n) => (+n >= 25 ? `第 ${n} 层啦！` : `一下跳了 ${n} 层！`));
  L.rule(/^YOU DID IT, (.+)! 🎉$/, (m, n) => `${who(n)}，你做到啦！🎉`);
})();
