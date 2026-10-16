/* ファイル種別定義（設定駆動）。新しい形式を追加するときはこの配列に1件足す。
 role: A=請求/提出実績(①形式) B=実施記録(②形式) C=サービス提供明細(③形式)
 headerKey: 先頭6行の中でこの文字列を含む行を見出し行とみなす
 detect: 見出しに全て含まれていれば、この種別と判定
 match: (任意) 行データから更に絞り込む判定。先に書いた種別が優先 */
var PARSER_CONFIG = {
  version: 1,
  services: ['居宅介護','重度訪問介護','行動援護','同行援護','移動支援'],
  labs: ['身体介護','家事援助','通院等介助','居宅介護(内訳不明)','重度訪問介護','行動援護','同行援護','移動支援'],
  kyotakuSub: {'身体':'身体介護','家事':'家事援助','通院':'通院等介助'},
  types: [
    { id:'ido_seikyu', label:'移動支援 請求提出実績（①形式）', role:'A', order:2, headerKey:'総費用',
      detect:['提出月','提供月','サービス種類','総費用','利用者コード'],
      match:{column:'サービス種類', allStartWith:'移動支援'},
      cols:{code:'利用者コード',name:'氏名',child:'児童氏名',subm:'提出月',ym:'提供月',svc:'サービス種類',total:'総費用',futan:'受給者負担',kouhi:'市町村請求',josei:'助成額'},
      svcRewrite:[['^移動支援.*$','移動支援']] },
    { id:'seikyu', label:'①請求/提出実績', role:'A', order:1, headerKey:'総費用',
      detect:['提出月','提供月','サービス種類','総費用','利用者コード'],
      cols:{code:'利用者コード',name:'氏名',child:'児童氏名',subm:'提出月',ym:'提供月',svc:'サービス種類',total:'総費用',futan:'受給者負担',kouhi:'市町村請求',josei:'助成額'},
      svcRewrite:[['^移動支援.*$','移動支援']] },
    { id:'jisseki', label:'②実施記録', role:'B', order:3, headerKey:'サービス提供日',
      detect:['サービス提供日','利用者名','職員名','サービス内容'],
      cols:{status:'状況',date:'サービス提供日',client:'利用者名',code:'利用者コード',staff:'職員名',content:'サービス内容',instr:'指示内容',note:'特記事項',minAct:'実施(分)',minPlan:'提供(分)'},
      okStatus:'実施済', nonBillable:['事務仕事','研修','会議','同行研修','担当者会議'], testWord:'テスト',
      contentMap:{'家事援助':['居宅介護','家事'],'身体介護':['居宅介護','身体'],'通院(有）':['居宅介護','通院'],'通院(無）':['居宅介護','通院'],
        '行動援護':['行動援護',''],'重度訪問介護':['重度訪問介護',''],'同援':['同行援護',''],'同援・区4':['同行援護',''],'地域移動（国）':['移動支援','']} },
    { id:'ido_meisai', label:'移動支援 サービス提供明細（③形式・1単位=10円）', role:'C', order:5, headerKey:'単位計／金額',
      detect:['提供日','サービス種別','コード','サービス名','単位計／金額'],
      match:{column:'サービス種別', allStartWith:'移動支援'},
      cols:{code:'利用者コード',name:'氏名',child:'児童氏名',date:'提供日',kind:'サービス種別',scode:'コード',sname:'サービス名',units:'単位計／金額'},
      codePrefix:{'11':'居宅介護','12':'重度訪問介護','13':'行動援護','15':'同行援護'}, kindStartsWith:{'移動支援':'移動支援'},
      kasan:'加算|減算', kasanExclude:'移動介護加算' },
    { id:'meisai', label:'③サービス提供明細', role:'C', order:4, headerKey:'単位計／金額',
      detect:['提供日','サービス種別','コード','サービス名','単位計／金額'],
      cols:{code:'利用者コード',name:'氏名',child:'児童氏名',date:'提供日',kind:'サービス種別',scode:'コード',sname:'サービス名',units:'単位計／金額'},
      codePrefix:{'11':'居宅介護','12':'重度訪問介護','13':'行動援護','15':'同行援護'}, kindStartsWith:{'移動支援':'移動支援'},
      kasan:'加算|減算', kasanExclude:'移動介護加算' }
  ]
};
if (typeof module!=='undefined') module.exports=PARSER_CONFIG;
