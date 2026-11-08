// 실제 국가 데이터 (근사치, 2024년 기준)
// 영문명(Natural Earth)|한국어|인구(백만)|GDP(십억$)|정부|성향|기술등급(1~4)|군사등급(0~5)|수도위도|수도경도
// 정부: D 민주 R 공화 C 입헌군주 A 절대군주 J 군사 O 일당 F 연방 T 신정
// 성향: p 평화 e 팽창 m 군국 c 상업 i 고립 h 패권 r 혁명 d 방어
export const COUNTRIES = `
United States of America|미국|335|27000|F|h|4|5|38.9|-77.0
China|중국|1410|17800|O|h|3|5|39.9|116.4
Japan|일본|124|4200|C|d|4|3|35.7|139.7
Germany|독일|84|4400|F|c|4|3|52.5|13.4
India|인도|1430|3700|F|d|2|4|28.6|77.2
United Kingdom|영국|68|3300|C|h|4|4|51.5|-0.1
France|프랑스|68|3000|R|h|4|4|48.9|2.4
Italy|이탈리아|59|2200|R|c|4|3|41.9|12.5
Brazil|브라질|216|2200|F|c|3|3|-15.8|-47.9
Canada|캐나다|40|2100|F|p|4|2|45.4|-75.7
Russia|러시아|144|2000|R|e|3|5|55.8|37.6
Mexico|멕시코|129|1800|F|c|3|2|19.4|-99.1
South Korea|대한민국|52|1700|D|d|4|4|37.6|127.0
Australia|호주|26|1700|F|d|4|2|-35.3|149.1
Spain|스페인|48|1600|C|c|4|2|40.4|-3.7
Indonesia|인도네시아|278|1400|R|c|2|3|-6.2|106.8
Turkey|튀르키예|85|1100|R|e|3|4|39.9|32.9
Netherlands|네덜란드|18|1100|C|c|4|2|52.4|4.9
Saudi Arabia|사우디아라비아|36|1100|A|h|3|3|24.7|46.7
Switzerland|스위스|9|880|F|i|4|1|46.9|7.4
Poland|폴란드|37|810|R|d|3|3|52.2|21.0
Taiwan|대만|24|760|D|d|4|3|25.0|121.5
Argentina|아르헨티나|46|640|F|c|3|2|-34.6|-58.4
Sweden|스웨덴|10.5|590|C|p|4|2|59.3|18.1
Belgium|벨기에|11.7|630|C|c|4|1|50.8|4.4
Ireland|아일랜드|5.2|550|R|p|4|1|53.3|-6.3
Thailand|태국|72|510|C|c|3|2|13.8|100.5
Israel|이스라엘|9.8|510|D|m|4|4|31.8|35.2
Austria|오스트리아|9.1|520|F|p|4|1|48.2|16.4
Norway|노르웨이|5.5|490|C|p|4|2|59.9|10.8
United Arab Emirates|아랍에미리트|10|510|A|c|3|2|24.5|54.4
Nigeria|나이지리아|224|360|F|c|1|2|9.1|7.5
Iran|이란|89|400|T|r|2|4|35.7|51.4
Egypt|이집트|112|390|R|d|2|3|30.0|31.2
Bangladesh|방글라데시|173|450|R|c|1|2|23.8|90.4
Vietnam|베트남|99|430|O|d|2|3|21.0|105.8
Philippines|필리핀|117|440|R|d|2|2|14.6|121.0
Malaysia|말레이시아|34|400|C|c|3|2|3.1|101.7
South Africa|남아프리카 공화국|60|380|R|c|2|2|-25.7|28.2
Denmark|덴마크|5.9|400|C|p|4|1|55.7|12.6
Colombia|콜롬비아|52|360|R|c|2|2|4.7|-74.1
Pakistan|파키스탄|240|340|F|m|1|4|33.7|73.1
Chile|칠레|19.6|330|R|c|3|2|-33.4|-70.7
Romania|루마니아|19|350|R|d|3|2|44.4|26.1
Czechia|체코|10.9|330|R|p|4|1|50.1|14.4
Finland|핀란드|5.6|300|R|d|4|2|60.2|24.9
Iraq|이라크|45|250|F|d|2|2|33.3|44.4
Portugal|포르투갈|10.4|290|R|p|4|1|38.7|-9.1
New Zealand|뉴질랜드|5.2|250|C|p|4|1|-41.3|174.8
Peru|페루|34|270|R|c|2|2|-12.0|-77.0
Kazakhstan|카자흐스탄|20|260|R|c|2|2|51.2|71.4
Greece|그리스|10.4|240|R|d|3|2|38.0|23.7
Algeria|알제리|46|240|R|d|2|3|36.8|3.1
Qatar|카타르|2.7|230|A|c|3|1|25.3|51.5
Hungary|헝가리|9.6|210|R|i|3|1|47.5|19.0
Ukraine|우크라이나|37|180|R|d|2|3|50.5|30.5
Kuwait|쿠웨이트|4.3|160|A|c|3|1|29.4|48.0
Morocco|모로코|37|150|C|c|2|2|34.0|-6.8
Ethiopia|에티오피아|126|160|F|d|1|2|9.0|38.7
Ecuador|에콰도르|18|120|R|c|2|1|-0.2|-78.5
Slovakia|슬로바키아|5.4|130|R|p|3|1|48.1|17.1
Dominican Rep.|도미니카 공화국|11|120|R|p|2|1|18.5|-69.9
Guatemala|과테말라|18|100|R|p|2|1|14.6|-90.5
Kenya|케냐|55|110|R|c|1|1|-1.3|36.8
Oman|오만|4.6|110|A|i|3|1|23.6|58.4
Myanmar|미얀마|54|65|J|m|1|2|19.8|96.1
Bulgaria|불가리아|6.5|100|R|p|3|1|42.7|23.3
Angola|앙골라|36|90|R|d|1|1|-8.8|13.2
Venezuela|베네수엘라|28|95|R|r|2|2|10.5|-66.9
Uzbekistan|우즈베키스탄|36|90|R|i|2|2|41.3|69.2
Sri Lanka|스리랑카|22|85|R|p|2|1|6.9|79.9
Luxembourg|룩셈부르크|0.66|85|C|c|4|0|49.6|6.1
Ghana|가나|34|76|R|p|1|1|5.6|-0.2
Panama|파나마|4.4|83|R|c|2|0|9.0|-79.5
Croatia|크로아티아|3.9|80|R|p|3|1|45.8|16.0
Belarus|벨라루스|9.2|72|R|m|2|2|53.9|27.6
Uruguay|우루과이|3.4|77|R|p|3|1|-34.9|-56.2
Lithuania|리투아니아|2.8|77|R|d|3|1|54.7|25.3
Costa Rica|코스타리카|5.2|86|R|p|3|0|9.9|-84.1
Serbia|세르비아|6.6|75|R|d|3|2|44.8|20.5
Slovenia|슬로베니아|2.1|68|R|p|4|1|46.1|14.5
Dem. Rep. Congo|콩고민주공화국|102|67|R|d|1|1|-4.3|15.3
Tanzania|탄자니아|67|79|R|p|1|1|-6.2|35.7
Côte d'Ivoire|코트디부아르|29|79|R|p|1|1|6.8|-5.3
Libya|리비아|7|50|J|r|2|1|32.9|13.2
Jordan|요르단|11|50|C|p|2|1|32.0|35.9
Turkmenistan|투르크메니스탄|6.5|60|O|i|2|1|37.9|58.4
Tunisia|튀니지|12|48|R|p|2|1|36.8|10.2
Bolivia|볼리비아|12|46|R|r|2|1|-16.5|-68.1
Cameroon|카메룬|28|48|R|d|1|1|3.9|11.5
Bahrain|바레인|1.5|44|A|c|3|0|26.2|50.6
Paraguay|파라과이|6.8|43|R|p|2|1|-25.3|-57.6
Uganda|우간다|48|50|R|d|1|1|0.3|32.6
Latvia|라트비아|1.9|43|R|d|3|1|56.9|24.1
Estonia|에스토니아|1.4|41|R|d|4|1|59.4|24.8
Nepal|네팔|30|41|F|p|1|1|27.7|85.3
Cambodia|캄보디아|17|31|C|p|1|1|11.6|104.9
El Salvador|엘살바도르|6.3|34|R|p|2|1|13.7|-89.2
Honduras|온두라스|10.6|34|R|p|1|1|14.1|-87.2
Cyprus|키프로스|1.3|32|R|p|3|0|35.2|33.4
Iceland|아이슬란드|0.4|31|R|p|4|0|64.1|-21.9
Papua New Guinea|파푸아뉴기니|10|31|C|i|1|0|-9.4|147.2
Senegal|세네갈|18|31|R|p|1|1|14.7|-17.4
Zambia|잠비아|20|28|R|p|1|1|-15.4|28.3
Zimbabwe|짐바브웨|16|35|R|r|1|1|-17.8|31.0
Georgia|조지아|3.7|30|R|d|2|1|41.7|44.8
Bosnia and Herz.|보스니아 헤르체고비나|3.2|27|F|p|2|0|43.9|18.4
Sudan|수단|48|30|J|m|1|2|15.6|32.5
Afghanistan|아프가니스탄|41|17|T|r|1|2|34.5|69.2
Albania|알바니아|2.8|23|R|p|2|0|41.3|19.8
Mozambique|모잠비크|33|20|R|p|1|1|-25.9|32.6
Mali|말리|23|20|J|m|1|1|12.6|-8.0
Burkina Faso|부르키나파소|23|20|J|m|1|1|12.4|-1.5
Botswana|보츠와나|2.6|20|R|p|2|1|-24.7|25.9
Gabon|가봉|2.4|20|J|d|1|0|0.4|9.5
Jamaica|자메이카|2.8|19|C|p|2|0|18.0|-76.8
Armenia|아르메니아|2.8|24|R|d|2|1|40.2|44.5
Mongolia|몽골|3.4|20|R|p|2|1|47.9|106.9
Azerbaijan|아제르바이잔|10|72|R|e|2|2|40.4|49.9
Benin|베냉|13.7|20|R|p|1|0|6.5|2.6
Guinea|기니|14|23|J|d|1|0|9.6|-13.6
Nicaragua|니카라과|7|17|O|r|1|1|12.1|-86.3
Madagascar|마다가스카르|30|16|R|p|1|0|-18.9|47.5
North Macedonia|북마케도니아|1.8|15|R|p|2|0|42.0|21.4
Macedonia|북마케도니아|1.8|15|R|p|2|0|42.0|21.4
Moldova|몰도바|2.5|16|R|p|2|0|47.0|28.9
Laos|라오스|7.6|15|O|i|1|1|18.0|102.6
Chad|차드|18|13|J|m|1|1|12.1|15.0
Niger|니제르|27|17|J|m|1|1|13.5|2.1
Rwanda|르완다|14|14|R|d|1|1|-1.9|30.1
Kyrgyzstan|키르기스스탄|7|14|R|p|1|1|42.9|74.6
Tajikistan|타지키스탄|10|12|R|i|1|1|38.6|68.8
Namibia|나미비아|2.6|12|R|p|2|0|-22.6|17.1
Malawi|말라위|20|12|R|p|1|0|-14.0|33.8
Mauritania|모리타니|4.9|10|R|d|1|1|18.1|-16.0
Kosovo|코소보|1.8|10|R|d|2|0|42.7|21.2
Montenegro|몬테네그로|0.6|7|R|p|2|0|42.4|19.3
Haiti|아이티|11.7|20|R|p|1|0|18.5|-72.3
Somalia|소말리아|18|11|F|m|1|1|2.0|45.3
Togo|토고|9|9|R|p|1|0|6.1|1.2
Sierra Leone|시에라리온|8.8|4|R|p|1|0|8.5|-13.2
Fiji|피지|0.9|5|R|p|2|0|-18.1|178.4
Eritrea|에리트레아|3.7|2.5|O|m|1|1|15.3|38.9
Burundi|부룬디|13|3|R|d|1|0|-3.4|29.4
Liberia|라이베리아|5.4|4|R|p|1|0|6.3|-10.8
Central African Rep.|중앙아프리카 공화국|5.7|2.5|R|d|1|0|4.4|18.6
Bhutan|부탄|0.8|3|C|i|1|0|27.5|89.6
Lesotho|레소토|2.3|2.3|C|p|1|0|-29.3|27.5
Belize|벨리즈|0.4|3|C|p|2|0|17.3|-88.8
Guyana|가이아나|0.8|16|R|c|2|0|6.8|-58.2
Suriname|수리남|0.6|3.5|R|p|2|0|5.9|-55.2
S. Sudan|남수단|11|5|J|m|1|1|4.9|31.6
Congo|콩고 공화국|6|15|R|p|1|0|-4.3|15.3
Eq. Guinea|적도기니|1.7|12|A|i|1|0|3.8|8.8
Gambia|감비아|2.7|2.3|R|p|1|0|13.5|-16.6
Guinea-Bissau|기니비사우|2.1|2|R|p|1|0|11.9|-15.6
Djibouti|지부티|1.1|4|R|c|1|0|11.6|43.1
eSwatini|에스와티니|1.2|4.7|A|i|1|0|-26.3|31.1
Timor-Leste|동티모르|1.4|2|R|p|1|0|-8.6|125.6
Solomon Is.|솔로몬 제도|0.7|1.6|C|p|1|0|-9.4|160.0
Vanuatu|바누아투|0.3|1|R|p|1|0|-17.7|168.3
Brunei|브루나이|0.45|15|A|c|3|0|4.9|114.9
Singapore|싱가포르|5.9|500|R|c|4|2|1.3|103.8
Palestine|팔레스타인|5.4|18|R|r|1|0|31.9|35.2
Lebanon|레바논|5.3|18|R|p|2|1|33.9|35.5
Syria|시리아|23|9|R|r|1|2|33.5|36.3
Yemen|예멘|34|21|R|r|1|1|15.4|44.2
North Korea|북한|26|18|O|m|1|4|39.0|125.8
Cuba|쿠바|11|100|O|r|2|1|23.1|-82.4
Trinidad and Tobago|트리니다드 토바고|1.5|28|R|c|3|0|10.7|-61.5
Mauritius|모리셔스|1.3|14|R|c|3|0|-20.2|57.5
Bahamas|바하마|0.4|14|C|c|3|0|25.0|-77.3
Greenland|그린란드|0.06|3|R|i|3|0|64.2|-51.7
W. Sahara|서사하라|0.6|1|R|r|1|0|27.2|-13.2
Comoros|코모로|0.85|1.3|R|p|1|0|-11.7|43.3
Cabo Verde|카보베르데|0.6|2.5|R|p|2|0|14.9|-23.5
N. Cyprus|북키프로스|0.4|4|R|d|2|0|35.2|33.4
Somaliland|소말릴란드|5|3|R|d|1|0|9.6|44.1
`;

// 해외 영토 → 본국 병합
export const TERRITORY = {
  'Puerto Rico': 'United States of America', 'Guam': 'United States of America', 'U.S. Virgin Is.': 'United States of America', 'N. Mariana Is.': 'United States of America', 'American Samoa': 'United States of America',
  'Falkland Is.': 'United Kingdom', 'Bermuda': 'United Kingdom', 'Cayman Is.': 'United Kingdom', 'British Virgin Is.': 'United Kingdom', 'Turks and Caicos Is.': 'United Kingdom', 'Montserrat': 'United Kingdom', 'Anguilla': 'United Kingdom', 'S. Geo. and the Is.': 'United Kingdom', 'Br. Indian Ocean Ter.': 'United Kingdom', 'Saint Helena': 'United Kingdom', 'Pitcairn Is.': 'United Kingdom', 'Jersey': 'United Kingdom', 'Guernsey': 'United Kingdom', 'Isle of Man': 'United Kingdom',
  'New Caledonia': 'France', 'Fr. Polynesia': 'France', 'St. Pierre and Miquelon': 'France', 'Wallis and Futuna Is.': 'France', 'St-Martin': 'France', 'St-Barthélemy': 'France', 'Fr. S. Antarctic Lands': 'France',
  'Aruba': 'Netherlands', 'Curaçao': 'Netherlands', 'Sint Maarten': 'Netherlands',
  'Hong Kong': 'China', 'Macao': 'China', 'Åland': 'Finland', 'Faeroe Is.': 'Denmark', 'Siachen Glacier': 'India',
  'Cook Is.': 'New Zealand', 'Niue': 'New Zealand', 'Norfolk Island': 'Australia', 'Heard I. and McDonald Is.': 'Australia', 'Ashmore and Cartier Is.': 'Australia', 'Indian Ocean Ter.': 'Australia',
};

// 실제 동맹 / 관계
export const ALLIANCES = [
  ['United States of America', 'Canada', 'United Kingdom', 'France', 'Germany', 'Italy', 'Spain', 'Portugal', 'Netherlands', 'Belgium', 'Luxembourg', 'Denmark', 'Norway', 'Iceland', 'Poland', 'Czechia', 'Slovakia', 'Hungary', 'Romania', 'Bulgaria', 'Greece', 'Turkey', 'Croatia', 'Slovenia', 'Albania', 'Montenegro', 'Macedonia', 'Estonia', 'Latvia', 'Lithuania', 'Finland', 'Sweden'],
  ['United States of America', 'Japan'], ['United States of America', 'South Korea'], ['United States of America', 'Australia'], ['United States of America', 'Philippines'], ['United States of America', 'New Zealand'],
  ['Russia', 'Belarus', 'Armenia', 'Kazakhstan', 'Kyrgyzstan', 'Tajikistan'],
  ['China', 'North Korea'], ['Saudi Arabia', 'United Arab Emirates', 'Bahrain', 'Kuwait'], ['Mali', 'Burkina Faso', 'Niger'],
];
export const RELATIONS = [
  ['Russia', 'Ukraine', -90], ['Israel', 'Iran', -95], ['India', 'Pakistan', -65], ['North Korea', 'South Korea', -85], ['China', 'Taiwan', -70],
  ['United States of America', 'Iran', -75], ['United States of America', 'North Korea', -80], ['China', 'United States of America', -35], ['Russia', 'United States of America', -50],
  ['Russia', 'United Kingdom', -45], ['Russia', 'Poland', -55], ['Russia', 'Germany', -35], ['Russia', 'France', -35], ['Russia', 'Lithuania', -50], ['Russia', 'Estonia', -50], ['Russia', 'Latvia', -50], ['Russia', 'Finland', -45],
  ['Armenia', 'Azerbaijan', -70], ['Saudi Arabia', 'Iran', -45], ['China', 'India', -35], ['Greece', 'Turkey', -15], ['Ethiopia', 'Eritrea', -50], ['Morocco', 'Algeria', -50],
  ['Venezuela', 'Guyana', -45], ['Serbia', 'Kosovo', -70], ['Japan', 'China', -30], ['Japan', 'North Korea', -70], ['United States of America', 'Israel', 70], ['Russia', 'China', 45], ['Russia', 'Iran', 40], ['Russia', 'North Korea', 50],
  ['United States of America', 'United Kingdom', 85], ['France', 'Germany', 70], ['South Korea', 'Japan', 15], ['Israel', 'Palestine', -95], ['Israel', 'Lebanon', -70], ['Israel', 'Syria', -70], ['Sudan', 'S. Sudan', -40], ['Somalia', 'Somaliland', -40],
  ['Cuba', 'United States of America', -55], ['Venezuela', 'United States of America', -50], ['China', 'Philippines', -35], ['China', 'Vietnam', -15], ['Pakistan', 'Afghanistan', -40], ['Rwanda', 'Dem. Rep. Congo', -50],
];
