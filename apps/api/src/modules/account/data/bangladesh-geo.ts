export interface DistrictData {
  id: string;
  nameEn: string;
  nameBn: string;
}

export interface DivisionData {
  id: string;
  nameEn: string;
  nameBn: string;
  districts: DistrictData[];
}

export const BANGLADESH_DIVISIONS: readonly DivisionData[] = [
  {
    id: 'BARISHAL',
    nameEn: 'Barishal',
    nameBn: 'বরিশাল',
    districts: [
      { id: 'BARGUNA', nameEn: 'Barguna', nameBn: 'বরগুনা' },
      { id: 'BARISHAL', nameEn: 'Barishal', nameBn: 'বরিশাল' },
      { id: 'BHOLA', nameEn: 'Bhola', nameBn: 'ভোলা' },
      { id: 'JHALOKATI', nameEn: 'Jhalokati', nameBn: 'ঝালকাঠি' },
      { id: 'PATUAKHALI', nameEn: 'Patuakhali', nameBn: 'পটুয়াখালী' },
      { id: 'PIROJPUR', nameEn: 'Pirojpur', nameBn: 'পিরোজপুর' },
    ],
  },
  {
    id: 'CHATTOGRAM',
    nameEn: 'Chattogram',
    nameBn: 'চট্টগ্রাম',
    districts: [
      { id: 'BANDARBAN', nameEn: 'Bandarban', nameBn: 'বান্দরবান' },
      { id: 'BRAHMANBARIA', nameEn: 'Brahmanbaria', nameBn: 'ব্রাহ্মণবাড়িয়া' },
      { id: 'CHANDPUR', nameEn: 'Chandpur', nameBn: 'চাঁদপুর' },
      { id: 'CHATTOGRAM', nameEn: 'Chattogram', nameBn: 'চট্টগ্রাম' },
      { id: 'COXS_BAZAR', nameEn: "Cox's Bazar", nameBn: 'কক্সবাজার' },
      { id: 'CUMILLA', nameEn: 'Cumilla', nameBn: 'কুমিল্লা' },
      { id: 'FENI', nameEn: 'Feni', nameBn: 'ফেনী' },
      { id: 'KHAGRACHHARI', nameEn: 'Khagrachhari', nameBn: 'খাগড়াছড়ি' },
      { id: 'LAKSHMIPUR', nameEn: 'Lakshmipur', nameBn: 'লক্ষ্মীপুর' },
      { id: 'NOAKHALI', nameEn: 'Noakhali', nameBn: 'নোয়াখালী' },
      { id: 'RANGAMATI', nameEn: 'Rangamati', nameBn: 'রাঙ্গামাটি' },
    ],
  },
  {
    id: 'DHAKA',
    nameEn: 'Dhaka',
    nameBn: 'ঢাকা',
    districts: [
      { id: 'DHAKA', nameEn: 'Dhaka', nameBn: 'ঢাকা' },
      { id: 'FARIDPUR', nameEn: 'Faridpur', nameBn: 'ফরিদপুর' },
      { id: 'GAZIPUR', nameEn: 'Gazipur', nameBn: 'গাজীপুর' },
      { id: 'GOPALGANJ', nameEn: 'Gopalganj', nameBn: 'গোপালগঞ্জ' },
      { id: 'KISHOREGANJ', nameEn: 'Kishoreganj', nameBn: 'কিশোরগঞ্জ' },
      { id: 'MADARIPUR', nameEn: 'Madaripur', nameBn: 'মাদারীপুর' },
      { id: 'MANIKGANJ', nameEn: 'Manikganj', nameBn: 'মানিকগঞ্জ' },
      { id: 'MUNSHIGANJ', nameEn: 'Munshiganj', nameBn: 'মুন্সীগঞ্জ' },
      { id: 'NARAYANGANJ', nameEn: 'Narayanganj', nameBn: 'নারায়ণগঞ্জ' },
      { id: 'NARSINGDI', nameEn: 'Narsingdi', nameBn: 'নরসিংদী' },
      { id: 'RAJBARI', nameEn: 'Rajbari', nameBn: 'রাজবাড়ী' },
      { id: 'SHARIATPUR', nameEn: 'Shariatpur', nameBn: 'শরীয়তপুর' },
      { id: 'TANGAIL', nameEn: 'Tangail', nameBn: 'টাঙ্গাইল' },
    ],
  },
  {
    id: 'KHULNA',
    nameEn: 'Khulna',
    nameBn: 'খুলনা',
    districts: [
      { id: 'BAGERHAT', nameEn: 'Bagerhat', nameBn: 'বাগেরহাট' },
      { id: 'CHUADANGA', nameEn: 'Chuadanga', nameBn: 'চুয়াডাঙ্গা' },
      { id: 'JASHORE', nameEn: 'Jashore', nameBn: 'যশোর' },
      { id: 'JHENAIDAH', nameEn: 'Jhenaidah', nameBn: 'ঝিনাইদহ' },
      { id: 'KHULNA', nameEn: 'Khulna', nameBn: 'খুলনা' },
      { id: 'KUSHTIA', nameEn: 'Kushtia', nameBn: 'কুষ্টিয়া' },
      { id: 'MAGURA', nameEn: 'Magura', nameBn: 'মাগুরা' },
      { id: 'MEHERPUR', nameEn: 'Meherpur', nameBn: 'মেহেরপুর' },
      { id: 'NARAIL', nameEn: 'Narail', nameBn: 'নড়াইল' },
      { id: 'SATKHIRA', nameEn: 'Satkhira', nameBn: 'সাতক্ষীরা' },
    ],
  },
  {
    id: 'MYMENSINGH',
    nameEn: 'Mymensingh',
    nameBn: 'ময়মনসিংহ',
    districts: [
      { id: 'JAMALPUR', nameEn: 'Jamalpur', nameBn: 'জামালপুর' },
      { id: 'MYMENSINGH', nameEn: 'Mymensingh', nameBn: 'ময়মনসিংহ' },
      { id: 'NETROKONA', nameEn: 'Netrokona', nameBn: 'নেত্রকোণা' },
      { id: 'SHERPUR', nameEn: 'Sherpur', nameBn: 'শেরপুর' },
    ],
  },
  {
    id: 'RAJSHAHI',
    nameEn: 'Rajshahi',
    nameBn: 'রাজশাহী',
    districts: [
      { id: 'BOGURA', nameEn: 'Bogura', nameBn: 'বগুড়া' },
      { id: 'CHAPAINAWABGANJ', nameEn: 'Chapainawabganj', nameBn: 'চাঁপাইনবাবগঞ্জ' },
      { id: 'JOYPURHAT', nameEn: 'Joypurhat', nameBn: 'জয়পুরহাট' },
      { id: 'NAOGAON', nameEn: 'Naogaon', nameBn: 'নওগাঁ' },
      { id: 'NATORE', nameEn: 'Natore', nameBn: 'নাটোর' },
      { id: 'PABNA', nameEn: 'Pabna', nameBn: 'পাবনা' },
      { id: 'RAJSHAHI', nameEn: 'Rajshahi', nameBn: 'রাজশাহী' },
      { id: 'SIRAJGANJ', nameEn: 'Sirajganj', nameBn: 'সিরাজগঞ্জ' },
    ],
  },
  {
    id: 'RANGPUR',
    nameEn: 'Rangpur',
    nameBn: 'রংপুর',
    districts: [
      { id: 'DINAJPUR', nameEn: 'Dinajpur', nameBn: 'দিনাজপুর' },
      { id: 'GAIBANDHA', nameEn: 'Gaibandha', nameBn: 'গাইবান্ধা' },
      { id: 'KURIGRAM', nameEn: 'Kurigram', nameBn: 'কুড়িগ্রাম' },
      { id: 'LALMONIRHAT', nameEn: 'Lalmonirhat', nameBn: 'লালমনিরহাট' },
      { id: 'NILPHAMARI', nameEn: 'Nilphamari', nameBn: 'নীলফামারী' },
      { id: 'PANCHAGARH', nameEn: 'Panchagarh', nameBn: 'পঞ্চগড়' },
      { id: 'RANGPUR', nameEn: 'Rangpur', nameBn: 'রংপুর' },
      { id: 'THAKURGAON', nameEn: 'Thakurgaon', nameBn: 'ঠাকুরগাঁও' },
    ],
  },
  {
    id: 'SYLHET',
    nameEn: 'Sylhet',
    nameBn: 'সিলেট',
    districts: [
      { id: 'HABIGANJ', nameEn: 'Habiganj', nameBn: 'হবিগঞ্জ' },
      { id: 'MOULVIBAZAR', nameEn: 'Moulvibazar', nameBn: 'মৌলভীবাজার' },
      { id: 'SUNAMGANJ', nameEn: 'Sunamganj', nameBn: 'সুনামগঞ্জ' },
      { id: 'SYLHET', nameEn: 'Sylhet', nameBn: 'সিলেট' },
    ],
  },
];

// Lookup maps for O(1) validation
const divisionMap = new Map<string, DivisionData>();
const districtMap = new Map<string, { district: DistrictData; divisionId: string }>();

for (const division of BANGLADESH_DIVISIONS) {
  divisionMap.set(division.id, division);
  for (const district of division.districts) {
    districtMap.set(district.id, { district, divisionId: division.id });
  }
}

/**
 * Returns true if divisionId is a recognized Bangladesh division.
 */
export function isValidDivision(divisionId: string): boolean {
  return divisionMap.has(divisionId);
}

/**
 * Returns true if districtId is a recognized Bangladesh district.
 */
export function isValidDistrict(districtId: string): boolean {
  return districtMap.has(districtId);
}

/**
 * Returns true if districtId belongs to the specified divisionId.
 */
export function isDistrictInDivision(divisionId: string, districtId: string): boolean {
  const item = districtMap.get(districtId);
  return item !== undefined && item.divisionId === divisionId;
}

/**
 * Returns the division data by ID, or undefined.
 */
export function getDivisionById(divisionId: string): DivisionData | undefined {
  return divisionMap.get(divisionId);
}

/**
 * Returns the district data by ID, or undefined.
 */
export function getDistrictById(districtId: string): DistrictData | undefined {
  return districtMap.get(districtId)?.district;
}

/**
 * Returns all divisions and districts hierarchy.
 */
export function getDivisionsData(): readonly DivisionData[] {
  return BANGLADESH_DIVISIONS;
}
