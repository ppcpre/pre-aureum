export interface StockSymbol {
  symbol: string; // SET ticker, no suffix (e.g. "PTT")
  name: string;
}

// Full SET50 constituents (source: SET official constituents document,
// media.set.or.th, "for calculating the index Jan 1 - Jun 30 2025" —
// SET revises this list every 6 months, Jan and Jul, so this will drift
// out of date over time. Re-pull from
// https://www.set.or.th/en/market/information/securities-list/constituents-list-set50-set100
// periodically rather than hand-editing entries in and out.
export const STOCK_WATCHLIST: StockSymbol[] = [
  { symbol: "ADVANC", name: "แอดวานซ์ อินโฟร์ เซอร์วิส (เอไอเอส)" },
  { symbol: "AOT", name: "ท่าอากาศยานไทย" },
  { symbol: "AWC", name: "แอสเสท เวิรด์ คอร์ป" },
  { symbol: "BANPU", name: "บ้านปู" },
  { symbol: "BBL", name: "ธนาคารกรุงเทพ" },
  { symbol: "BDMS", name: "กรุงเทพดุสิตเวชการ" },
  { symbol: "BEM", name: "ทางด่วนและรถไฟฟ้ากรุงเทพ" },
  { symbol: "BGRIM", name: "บี.กริม เพาเวอร์" },
  { symbol: "BH", name: "โรงพยาบาลบำรุงราษฎร์" },
  { symbol: "BJC", name: "เบอร์ลี่ ยุคเกอร์" },
  { symbol: "BTS", name: "บีทีเอส กรุ๊ป โฮลดิ้งส์" },
  { symbol: "CBG", name: "คาราบาวกรุ๊ป" },
  { symbol: "CCET", name: "แคล-คอมพ์ อีเลคโทรนิคส์" },
  { symbol: "COM7", name: "คอมเซเว่น" },
  { symbol: "CPALL", name: "ซีพี ออลล์" },
  { symbol: "CPF", name: "เจริญโภคภัณฑ์อาหาร" },
  { symbol: "CPN", name: "เซ็นทรัลพัฒนา" },
  { symbol: "CRC", name: "เซ็นทรัล รีเทล คอร์ปอเรชั่น" },
  { symbol: "DELTA", name: "เดลต้า อีเลคโทรนิคส์" },
  { symbol: "EGCO", name: "ผลิตไฟฟ้า (เอ็กโก)" },
  { symbol: "GLOBAL", name: "สยามโกลบอลเฮ้าส์" },
  { symbol: "GPSC", name: "โกลบอล เพาเวอร์ ซินเนอร์ยี่" },
  { symbol: "GULF", name: "กัลฟ์ เอ็นเนอร์จี ดีเวลลอปเมนท์" },
  { symbol: "HMPRO", name: "โฮมโปรดักส์ เซ็นเตอร์" },
  { symbol: "ITC", name: "ไอ-เทล คอร์ปอเรชั่น" },
  { symbol: "IVL", name: "อินโดรามา เวนเจอร์ส" },
  { symbol: "KBANK", name: "ธนาคารกสิกรไทย" },
  { symbol: "KTB", name: "ธนาคารกรุงไทย" },
  { symbol: "KTC", name: "บัตรกรุงไทย" },
  { symbol: "LH", name: "แลนด์แอนด์เฮ้าส์" },
  { symbol: "MINT", name: "ไมเนอร์ อินเตอร์เนชั่นแนล" },
  { symbol: "MTC", name: "เมืองไทย แคปปิตอล" },
  { symbol: "OR", name: "ปตท. น้ำมันและการค้าปลีก" },
  { symbol: "OSP", name: "โอสถสภา" },
  { symbol: "PTT", name: "ปตท." },
  { symbol: "PTTEP", name: "ปตท. สำรวจและผลิตปิโตรเลียม" },
  { symbol: "PTTGC", name: "พีทีที โกลบอล เคมิคอล" },
  { symbol: "RATCH", name: "ราช กรุ๊ป" },
  { symbol: "SAWAD", name: "ศรีสวัสดิ์ คอร์ปอเรชั่น" },
  { symbol: "SCB", name: "เอสซีบี เอกซ์" },
  { symbol: "SCC", name: "ปูนซิเมนต์ไทย" },
  { symbol: "SCGP", name: "เอสซีจี แพคเกจจิ้ง" },
  { symbol: "TISCO", name: "ทิสโก้ไฟแนนเชียลกรุ๊ป" },
  { symbol: "TLI", name: "ไทยประกันชีวิต" },
  { symbol: "TOP", name: "ไทยออยล์" },
  { symbol: "TRUE", name: "ทรู คอร์ปอเรชั่น" },
  { symbol: "TTB", name: "ทีเอ็มบีธนชาต" },
  { symbol: "TU", name: "ไทยยูเนี่ยน กรุ๊ป" },
  { symbol: "VGI", name: "วีจีไอ" },
  { symbol: "WHA", name: "ดับบลิวเอชเอ คอร์ปอเรชั่น" },
];

export function isKnownSymbol(symbol: string): boolean {
  return STOCK_WATCHLIST.some((s) => s.symbol === symbol.toUpperCase());
}
