/**
 * 실제 지도 시나리오. 현대 국경(Natural Earth)을 기반으로
 * 국가 병합(members)·경위도 영역 분할(regions)로 역사적 국경을 근사한다.
 */
export type LL = (lat: number, lon: number) => boolean;
export interface ScenEntity {
  key: string; ko: string; members?: string[]; regions?: { of: string; test: LL }[];
  pop?: number; gdp?: number; gov: string; pers: string; tier: number; mil: number;
  cap: [number, number]; capName: string; color?: number; nukes?: number;
}
export interface Scenario {
  id: string; name: string; year: number; startDay: number; desc: string; emoji: string;
  popFactor: number; gdpPerCap: number;
  entities: ScenEntity[];
  rename?: Record<string, string>;
  alliances: string[][]; relations: [string, string, number][];
  wars: { att: string[]; def: string[]; name: string }[];
  vassals: [string, string][]; naps: [string, string][];
  occupied?: { by: string; owner: string; test: LL }[];
}
const box = (la0: number, la1: number, lo0: number, lo1: number): LL => (la, lo) => la >= la0 && la <= la1 && lo >= lo0 && lo <= lo1;

const BRIT_COLONIES = ['India', 'Pakistan', 'Bangladesh', 'Myanmar', 'Sri Lanka', 'Malaysia', 'Singapore', 'Brunei', 'Sudan', 'S. Sudan', 'Uganda', 'Kenya', 'Zimbabwe', 'Zambia', 'Malawi', 'Botswana', 'Lesotho', 'eSwatini', 'Nigeria', 'Ghana', 'Sierra Leone', 'Gambia', 'Somaliland', 'Guyana', 'Belize', 'Jamaica', 'Bahamas', 'Trinidad and Tobago', 'Cyprus', 'N. Cyprus', 'Kuwait', 'Qatar', 'United Arab Emirates', 'Bahrain', 'Oman', 'Fiji', 'Solomon Is.', 'Mauritius'];
const FR_COLONIES = ['Algeria', 'Tunisia', 'Morocco', 'Mauritania', 'Senegal', 'Mali', 'Guinea', "Côte d'Ivoire", 'Burkina Faso', 'Niger', 'Chad', 'Central African Rep.', 'Congo', 'Gabon', 'Benin', 'Madagascar', 'Vietnam', 'Laos', 'Cambodia', 'Djibouti', 'Comoros', 'Vanuatu'];
const RUS_CORE = ['Russia', 'Ukraine', 'Belarus', 'Georgia', 'Armenia', 'Azerbaijan', 'Kazakhstan', 'Uzbekistan', 'Turkmenistan', 'Kyrgyzstan', 'Tajikistan'];
const YUGO = ['Serbia', 'Croatia', 'Slovenia', 'Bosnia and Herz.', 'Montenegro', 'Macedonia', 'North Macedonia', 'Kosovo'];

export const SCENARIOS: Scenario[] = [
  // ───────────── 1914 ─────────────
  {
    id: 'ww1', name: '1914 제1차 세계대전', year: 1914, startDay: 211, emoji: '🎖', popFactor: 0.2, gdpPerCap: 0.35,
    desc: '사라예보의 총성. 동맹국과 협상국이 충돌하고 제국들이 전쟁에 뛰어든다.',
    rename: { Iran: '페르시아', Thailand: '시암', Turkey: '오스만 제국', Ethiopia: '에티오피아 제국', China: '중화민국' },
    entities: [
      { key: 'GER', ko: '독일 제국', members: ['Germany', 'Namibia', 'Tanzania', 'Cameroon', 'Togo', 'Rwanda', 'Burundi'], regions: [{ of: 'Poland', test: (la, lo) => lo < 19.2 || (la > 53.3 && lo < 22.8) }, { of: 'Russia', test: box(54.2, 55.4, 19, 23) }, { of: 'Lithuania', test: box(55.2, 56, 20.9, 22) }], pop: 77, gdp: 237, gov: 'C', pers: 'm', tier: 4, mil: 5, cap: [52.5, 13.4], capName: '베를린', color: 0x5d5d5d },
      { key: 'AUH', ko: '오스트리아-헝가리', members: ['Austria', 'Hungary', 'Czechia', 'Slovakia', 'Slovenia', 'Croatia', 'Bosnia and Herz.'], regions: [{ of: 'Poland', test: (la, lo) => la < 50.4 && lo >= 19.2 }, { of: 'Ukraine', test: (la, lo) => lo < 26.2 && la > 47.6 }, { of: 'Romania', test: (la, lo) => la > 45.6 && lo < 25.6 }, { of: 'Italy', test: box(45.5, 47.2, 10.4, 14) }], pop: 52, gdp: 100, gov: 'A', pers: 'e', tier: 3, mil: 4, cap: [48.2, 16.4], capName: '빈', color: 0xd8c27a },
      { key: 'RUS', ko: '러시아 제국', members: [...RUS_CORE, 'Finland', 'Estonia', 'Latvia', 'Lithuania', 'Poland', 'Moldova', 'Ukraine'], pop: 170, gdp: 257, gov: 'A', pers: 'e', tier: 2, mil: 5, cap: [59.9, 30.3], capName: '상트페테르부르크', color: 0x3f6b3f },
      { key: 'FRA', ko: '프랑스', members: ['France', ...FR_COLONIES], pop: 40 + 50, gdp: 145, gov: 'R', pers: 'd', tier: 4, mil: 5, cap: [48.9, 2.4], capName: '파리', color: 0x3a5fcd },
      { key: 'GBR', ko: '대영 제국', members: ['United Kingdom', 'Ireland', 'Egypt', 'Iraq', 'Jordan', 'Israel', 'Palestine', ...BRIT_COLONIES], pop: 46 + 330, gdp: 320, gov: 'C', pers: 'h', tier: 4, mil: 5, cap: [51.5, -0.1], capName: '런던', color: 0xb03a48 },
      { key: 'ITA', ko: '이탈리아 왕국', members: ['Italy', 'Libya', 'Eritrea', 'Somalia'], pop: 36, gdp: 91, gov: 'C', pers: 'e', tier: 3, mil: 4, cap: [41.9, 12.5], capName: '로마', color: 0x4caf50 },
      { key: 'OTT', ko: '오스만 제국', members: ['Turkey', 'Syria', 'Lebanon'], regions: [{ of: 'Saudi Arabia', test: (la, lo) => lo < 42 && la > 19 }, { of: 'Yemen', test: (la, lo) => lo < 45 }, { of: 'Iraq', test: () => true }, { of: 'Jordan', test: () => true }, { of: 'Israel', test: () => true }, { of: 'Palestine', test: () => true }], pop: 21, gdp: 25, gov: 'A', pers: 'd', tier: 2, mil: 3, cap: [41.0, 28.9], capName: '이스탄불', color: 0x6b8e5a },
      { key: 'JPN', ko: '일본 제국', members: ['Japan', 'South Korea', 'North Korea', 'Taiwan'], pop: 70, gdp: 72, gov: 'C', pers: 'e', tier: 3, mil: 4, cap: [35.7, 139.7], capName: '도쿄', color: 0xe8dcc0 },
      { key: 'USA', ko: '미국', members: ['United States of America', 'Philippines'], pop: 99, gdp: 517, gov: 'F', pers: 'i', tier: 4, mil: 3, cap: [38.9, -77.0], capName: '워싱턴', color: 0x3d6fb6 },
      { key: 'SRB', ko: '세르비아 왕국', members: ['Serbia', 'Kosovo', 'Macedonia', 'North Macedonia'], pop: 4.5, gdp: 5, gov: 'C', pers: 'd', tier: 2, mil: 2, cap: [44.8, 20.5], capName: '베오그라드', color: 0x8a4a4a },
      { key: 'BEL', ko: '벨기에', members: ['Belgium', 'Dem. Rep. Congo'], pop: 7.6 + 10, gdp: 32, gov: 'C', pers: 'd', tier: 4, mil: 2, cap: [50.8, 4.4], capName: '브뤼셀', color: 0xd4b13c },
      { key: 'NLD', ko: '네덜란드', members: ['Netherlands', 'Indonesia', 'Suriname'], pop: 6 + 45, gdp: 25, gov: 'C', pers: 'c', tier: 4, mil: 1, cap: [52.4, 4.9], capName: '암스테르담', color: 0xe08a2a },
      { key: 'POR', ko: '포르투갈', members: ['Portugal', 'Angola', 'Mozambique', 'Guinea-Bissau', 'Timor-Leste', 'Cabo Verde'], pop: 6 + 8, gdp: 8, gov: 'R', pers: 'd', tier: 2, mil: 1, cap: [38.7, -9.1], capName: '리스본', color: 0x2e7d5b },
      { key: 'ESP', ko: '스페인 왕국', members: ['Spain', 'W. Sahara', 'Eq. Guinea'], pop: 20, gdp: 41, gov: 'C', pers: 'i', tier: 3, mil: 2, cap: [40.4, -3.7], capName: '마드리드', color: 0xe5c33a },
      { key: 'DEN', ko: '덴마크', members: ['Denmark', 'Greenland', 'Iceland'], pop: 3, gdp: 11, gov: 'C', pers: 'p', tier: 4, mil: 1, cap: [55.7, 12.6], capName: '코펜하겐' },
      { key: 'ROM', ko: '루마니아 왕국', members: ['Romania'], pop: 7.5, gdp: 11, gov: 'C', pers: 'd', tier: 2, mil: 2, cap: [44.4, 26.1], capName: '부쿠레슈티', color: 0xc8b04a },
      { key: 'CHN', ko: '중화민국', members: ['China'], pop: 430, gdp: 241, gov: 'R', pers: 'd', tier: 1, mil: 2, cap: [39.9, 116.4], capName: '베이징', color: 0xd9a441 },
      { key: 'CAN', ko: '캐나다 자치령', members: ['Canada'], pop: 8, gdp: 34, gov: 'C', pers: 'p', tier: 3, mil: 1, cap: [45.4, -75.7], capName: '오타와', color: 0xd04848 },
      { key: 'AUS', ko: '오스트레일리아 연방', members: ['Australia', 'Papua New Guinea'], pop: 5, gdp: 27, gov: 'C', pers: 'p', tier: 3, mil: 1, cap: [-35.3, 149.1], capName: '멜버른', color: 0x2f8f8f },
      { key: 'SAF', ko: '남아프리카 연방', members: ['South Africa'], pop: 6, gdp: 12, gov: 'C', pers: 'd', tier: 2, mil: 1, cap: [-25.7, 28.2], capName: '프리토리아' },
    ],
    alliances: [['GER', 'AUH', 'OTT'], ['FRA', 'RUS', 'GBR', 'SRB', 'BEL', 'JPN'], ['GBR', 'CAN', 'AUS', 'SAF']],
    relations: [['GER', 'FRA', -80], ['GER', 'RUS', -70], ['AUH', 'SRB', -95], ['AUH', 'RUS', -75], ['GER', 'GBR', -60], ['ITA', 'AUH', -30], ['OTT', 'RUS', -70], ['USA', 'GBR', 40], ['JPN', 'GER', -40], ['ITA', 'FRA', 10]],
    wars: [{ att: ['AUH', 'GER', 'OTT'], def: ['SRB', 'RUS', 'FRA', 'GBR', 'BEL', 'JPN', 'CAN', 'AUS', 'SAF'], name: '제1차 세계대전' }],
    vassals: [], naps: [],
  },
  // ───────────── 1939 ─────────────
  {
    id: 'ww2', name: '1939 제2차 세계대전', year: 1939, startDay: 243, emoji: '⚔', popFactor: 0.28, gdpPerCap: 0.5,
    desc: '독일의 폴란드 침공. 추축국과 연합국, 중일전쟁이 진행 중인 세계.',
    rename: { Iran: '이란 제국', Thailand: '타이 왕국', Turkey: '튀르키예 공화국', China: '중화민국' },
    entities: [
      { key: 'GER', ko: '독일 국', members: ['Germany', 'Austria', 'Czechia'], regions: [{ of: 'Russia', test: box(54.2, 55.4, 19, 23) }, { of: 'Lithuania', test: box(55.2, 56, 20.9, 21.6) }, { of: 'Poland', test: (la, lo) => (lo < 16.2 && la > 51) || (la > 53.6 && lo > 19.2 && lo < 22.8) }], pop: 80, gdp: 412, gov: 'O', pers: 'e', tier: 4, mil: 5, cap: [52.5, 13.4], capName: '베를린', color: 0x5d5d5d },
      { key: 'SLO', ko: '슬로바키아 공화국', members: ['Slovakia'], pop: 2.6, gdp: 5, gov: 'O', pers: 'd', tier: 2, mil: 1, cap: [48.1, 17.1], capName: '브라티슬라바', color: 0x6a8fb0 },
      { key: 'POL', ko: '폴란드 공화국', members: ['Poland'], regions: [{ of: 'Ukraine', test: (la, lo) => lo < 26.3 && la > 48.2 }, { of: 'Belarus', test: (la, lo) => lo < 27.2 }, { of: 'Lithuania', test: box(54, 55.2, 24.8, 26.8) }], pop: 35, gdp: 76, gov: 'R', pers: 'd', tier: 3, mil: 3, cap: [52.2, 21.0], capName: '바르샤바', color: 0xd06070 },
      { key: 'SOV', ko: '소련', members: [...RUS_CORE], pop: 170, gdp: 366, gov: 'O', pers: 'r', tier: 3, mil: 5, cap: [55.8, 37.6], capName: '모스크바', color: 0x8b2020 },
      { key: 'FRA', ko: '프랑스', members: ['France', 'Syria', 'Lebanon', 'Cameroon', 'Togo', ...FR_COLONIES], pop: 42 + 65, gdp: 190, gov: 'R', pers: 'd', tier: 4, mil: 4, cap: [48.9, 2.4], capName: '파리', color: 0x3a5fcd },
      { key: 'GBR', ko: '대영 제국', members: ['United Kingdom', 'Jordan', 'Israel', 'Palestine', 'Tanzania', ...BRIT_COLONIES], pop: 47 + 400, gdp: 560, gov: 'C', pers: 'h', tier: 4, mil: 5, cap: [51.5, -0.1], capName: '런던', color: 0xb03a48 },
      { key: 'ITA', ko: '이탈리아 왕국', members: ['Italy', 'Libya', 'Eritrea', 'Somalia', 'Ethiopia', 'Albania'], pop: 44 + 12, gdp: 155, gov: 'O', pers: 'e', tier: 3, mil: 4, cap: [41.9, 12.5], capName: '로마', color: 0x4caf50 },
      { key: 'JPN', ko: '일본 제국', members: ['Japan', 'South Korea', 'North Korea', 'Taiwan'], pop: 100, gdp: 200, gov: 'J', pers: 'e', tier: 3, mil: 5, cap: [35.7, 139.7], capName: '도쿄', color: 0xe8dcc0 },
      { key: 'MAN', ko: '만주국', regions: [{ of: 'China', test: (la, lo) => (la > 40.5 && lo > 118) || (la > 42 && lo > 115.5) }], pop: 40, gdp: 30, gov: 'A', pers: 'd', tier: 2, mil: 2, cap: [43.9, 125.3], capName: '신징', color: 0x9a7a3a },
      { key: 'CHN', ko: '중화민국', members: ['China'], pop: 470, gdp: 270, gov: 'O', pers: 'd', tier: 1, mil: 3, cap: [29.6, 106.5], capName: '충칭', color: 0xd9a441 },
      { key: 'USA', ko: '미국', members: ['United States of America', 'Philippines'], pop: 147, gdp: 870, gov: 'F', pers: 'i', tier: 4, mil: 3, cap: [38.9, -77.0], capName: '워싱턴', color: 0x3d6fb6 },
      { key: 'YUG', ko: '유고슬라비아 왕국', members: YUGO, pop: 15, gdp: 25, gov: 'C', pers: 'd', tier: 2, mil: 2, cap: [44.8, 20.5], capName: '베오그라드', color: 0x7a6aa8 },
      { key: 'ROM', ko: '루마니아 왕국', members: ['Romania', 'Moldova'], pop: 19, gdp: 30, gov: 'C', pers: 'd', tier: 2, mil: 2, cap: [44.4, 26.1], capName: '부쿠레슈티', color: 0xc8b04a },
      { key: 'BEL', ko: '벨기에', members: ['Belgium', 'Dem. Rep. Congo', 'Rwanda', 'Burundi'], pop: 8 + 14, gdp: 40, gov: 'C', pers: 'd', tier: 4, mil: 2, cap: [50.8, 4.4], capName: '브뤼셀', color: 0xd4b13c },
      { key: 'NLD', ko: '네덜란드', members: ['Netherlands', 'Indonesia', 'Suriname'], pop: 9 + 70, gdp: 45, gov: 'C', pers: 'c', tier: 4, mil: 1, cap: [52.4, 4.9], capName: '암스테르담', color: 0xe08a2a },
      { key: 'POR', ko: '포르투갈', members: ['Portugal', 'Angola', 'Mozambique', 'Guinea-Bissau', 'Timor-Leste', 'Cabo Verde'], pop: 7 + 10, gdp: 13, gov: 'O', pers: 'i', tier: 2, mil: 1, cap: [38.7, -9.1], capName: '리스본', color: 0x2e7d5b },
      { key: 'ESP', ko: '스페인국', members: ['Spain', 'W. Sahara', 'Eq. Guinea'], pop: 26, gdp: 45, gov: 'J', pers: 'i', tier: 2, mil: 2, cap: [40.4, -3.7], capName: '마드리드', color: 0xe5c33a },
      { key: 'DEN', ko: '덴마크', members: ['Denmark', 'Greenland', 'Iceland'], pop: 4, gdp: 20, gov: 'C', pers: 'p', tier: 4, mil: 1, cap: [55.7, 12.6], capName: '코펜하겐' },
      { key: 'SAF', ko: '남아프리카 연방', members: ['South Africa', 'Namibia'], pop: 10, gdp: 20, gov: 'C', pers: 'd', tier: 3, mil: 1, cap: [-25.7, 28.2], capName: '프리토리아' },
      { key: 'CAN', ko: '캐나다', members: ['Canada'], pop: 11, gdp: 45, gov: 'C', pers: 'd', tier: 4, mil: 2, cap: [45.4, -75.7], capName: '오타와', color: 0xd04848 },
      { key: 'AUS', ko: '오스트레일리아', members: ['Australia', 'Papua New Guinea'], pop: 7, gdp: 40, gov: 'C', pers: 'd', tier: 4, mil: 2, cap: [-35.3, 149.1], capName: '캔버라', color: 0x2f8f8f },
      { key: 'MON', ko: '몽골 인민공화국', members: ['Mongolia'], pop: 0.8, gdp: 1, gov: 'O', pers: 'd', tier: 1, mil: 1, cap: [47.9, 106.9], capName: '울란바토르' },
    ],
    alliances: [['GER', 'ITA'], ['GBR', 'FRA', 'POL'], ['GBR', 'CAN', 'AUS', 'SAF']],
    relations: [['GER', 'POL', -95], ['GER', 'FRA', -80], ['GER', 'GBR', -75], ['JPN', 'CHN', -95], ['GER', 'SOV', 10], ['JPN', 'SOV', -60], ['JPN', 'USA', -40], ['GER', 'JPN', 60], ['ITA', 'JPN', 40], ['SOV', 'POL', -50], ['USA', 'GBR', 60], ['SOV', 'GBR', -30], ['ITA', 'FRA', -40]],
    wars: [{ att: ['GER', 'SLO'], def: ['POL', 'GBR', 'FRA', 'CAN', 'AUS', 'SAF'], name: '제2차 세계대전' }, { att: ['JPN', 'MAN'], def: ['CHN'], name: '중일전쟁' }],
    vassals: [['SLO', 'GER'], ['MAN', 'JPN'], ['MON', 'SOV']], naps: [['GER', 'SOV']],
    occupied: [{ by: 'JPN', owner: 'CHN', test: (la, lo) => lo > 112.5 && la > 22 && la < 41 }],
  },
  // ───────────── 1962 ─────────────
  {
    id: 'cold', name: '1962 냉전', year: 1962, startDay: 280, emoji: '☢', popFactor: 0.4, gdpPerCap: 0.8,
    desc: '쿠바 미사일 위기. NATO와 바르샤바 조약기구, 분단된 독일·한반도·베트남.',
    rename: { Iran: '이란 제국', China: '중화인민공화국', Taiwan: '중화민국(대만)', 'South Korea': '대한민국', 'North Korea': '조선민주주의인민공화국' },
    entities: [
      { key: 'SOV', ko: '소련', members: [...RUS_CORE, 'Estonia', 'Latvia', 'Lithuania', 'Moldova'], pop: 222, gdp: 1060, gov: 'O', pers: 'h', tier: 3, mil: 5, cap: [55.8, 37.6], capName: '모스크바', color: 0x8b2020, nukes: 3300 },
      { key: 'USA', ko: '미국', members: ['United States of America'], pop: 187, gdp: 2600, gov: 'F', pers: 'h', tier: 4, mil: 5, cap: [38.9, -77.0], capName: '워싱턴', color: 0x3d6fb6, nukes: 25000 },
      { key: 'FRG', ko: '서독', regions: [{ of: 'Germany', test: (la, lo) => !(lo > 10.6 && la > 50.3) || (lo < 11.2 && la < 51.4) }], pop: 56, gdp: 600, gov: 'F', pers: 'p', tier: 4, mil: 3, cap: [50.7, 7.1], capName: '본', color: 0x6a6a6a },
      { key: 'GDR', ko: '동독', regions: [{ of: 'Germany', test: () => true }], pop: 17, gdp: 120, gov: 'O', pers: 'd', tier: 3, mil: 2, cap: [52.5, 13.4], capName: '동베를린', color: 0x9a4a4a },
      { key: 'CSK', ko: '체코슬로바키아', members: ['Czechia', 'Slovakia'], pop: 14, gdp: 90, gov: 'O', pers: 'd', tier: 3, mil: 2, cap: [50.1, 14.4], capName: '프라하', color: 0x6a8fb0 },
      { key: 'YUG', ko: '유고슬라비아', members: YUGO, pop: 19, gdp: 50, gov: 'O', pers: 'i', tier: 2, mil: 2, cap: [44.8, 20.5], capName: '베오그라드', color: 0x7a6aa8 },
      { key: 'NVN', ko: '베트남 민주공화국', regions: [{ of: 'Vietnam', test: (la) => la > 17 }], pop: 17, gdp: 10, gov: 'O', pers: 'r', tier: 1, mil: 3, cap: [21.0, 105.8], capName: '하노이', color: 0xb03a3a },
      { key: 'SVN', ko: '베트남 공화국', members: ['Vietnam'], pop: 15, gdp: 12, gov: 'R', pers: 'd', tier: 1, mil: 2, cap: [10.8, 106.7], capName: '사이공', color: 0xd8c040 },
      { key: 'GBR', ko: '영국', members: ['United Kingdom', 'Kenya', 'Uganda', 'Zambia', 'Malawi', 'Zimbabwe', 'Botswana', 'Lesotho', 'eSwatini', 'Gambia', 'Guyana', 'Belize', 'Bahamas', 'Mauritius', 'Fiji', 'Solomon Is.', 'Qatar', 'United Arab Emirates', 'Bahrain', 'Oman', 'Brunei'], pop: 53 + 30, gdp: 700, gov: 'C', pers: 'h', tier: 4, mil: 4, cap: [51.5, -0.1], capName: '런던', color: 0xb03a48, nukes: 270 },
      { key: 'FRA', ko: '프랑스', members: ['France', 'Djibouti', 'Comoros', 'Vanuatu'], pop: 47, gdp: 520, gov: 'R', pers: 'h', tier: 4, mil: 4, cap: [48.9, 2.4], capName: '파리', color: 0x3a5fcd, nukes: 30 },
      { key: 'POR', ko: '포르투갈', members: ['Portugal', 'Angola', 'Mozambique', 'Guinea-Bissau', 'Timor-Leste', 'Cabo Verde'], pop: 9 + 12, gdp: 30, gov: 'O', pers: 'i', tier: 2, mil: 2, cap: [38.7, -9.1], capName: '리스본', color: 0x2e7d5b },
      { key: 'ESP', ko: '스페인국', members: ['Spain', 'W. Sahara', 'Eq. Guinea'], pop: 31, gdp: 120, gov: 'J', pers: 'i', tier: 3, mil: 2, cap: [40.4, -3.7], capName: '마드리드', color: 0xe5c33a },
      { key: 'CHN', ko: '중화인민공화국', members: ['China'], pop: 670, gdp: 300, gov: 'O', pers: 'r', tier: 2, mil: 4, cap: [39.9, 116.4], capName: '베이징', color: 0xc8392b },
      { key: 'DEN', ko: '덴마크', members: ['Denmark', 'Greenland'], pop: 4.6, gdp: 50, gov: 'C', pers: 'p', tier: 4, mil: 1, cap: [55.7, 12.6], capName: '코펜하겐' },
    ],
    alliances: [
      ['USA', 'GBR', 'FRA', 'FRG', 'Canada', 'Italy', 'Belgium', 'Netherlands', 'Luxembourg', 'DEN', 'Norway', 'Iceland', 'POR', 'Greece', 'Turkey'],
      ['SOV', 'GDR', 'Poland', 'CSK', 'Hungary', 'Romania', 'Bulgaria', 'Albania', 'Cuba'],
      ['USA', 'Japan'], ['USA', 'South Korea'], ['USA', 'Taiwan'], ['USA', 'Australia', 'New Zealand'], ['USA', 'SVN', 'Philippines', 'Thailand'],
      ['CHN', 'North Korea', 'NVN'],
    ],
    relations: [['USA', 'SOV', -80], ['USA', 'Cuba', -90], ['USA', 'CHN', -70], ['SOV', 'CHN', -20], ['FRG', 'GDR', -70], ['South Korea', 'North Korea', -90], ['NVN', 'SVN', -95], ['CHN', 'Taiwan', -95], ['India', 'CHN', -60], ['India', 'Pakistan', -60], ['Israel', 'Egypt', -80], ['Israel', 'Syria', -80]],
    wars: [{ att: ['NVN'], def: ['SVN'], name: '베트남 전쟁' }],
    vassals: [['GDR', 'SOV'], ['Mongolia', 'SOV']], naps: [],
  },
];
