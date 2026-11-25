const { createHash } = require('node:crypto');

// The in-memory farm store mirrors the seeded administrative geography so API
// tests can exercise Bangladesh-specific location validation without a
// database. The Prisma adapter reads the same tables from PostgreSQL.
const DIVISIONS = [
  { code: 'BD-BAR', name: 'Barishal', name_bn: 'বরিশাল' },
  { code: 'BD-CTG', name: 'Chattogram', name_bn: 'চট্টগ্রাম' },
  { code: 'BD-DHA', name: 'Dhaka', name_bn: 'ঢাকা' },
  { code: 'BD-KHU', name: 'Khulna', name_bn: 'খুলনা' },
  { code: 'BD-MYM', name: 'Mymensingh', name_bn: 'ময়মনসিংহ' },
  { code: 'BD-RAJ', name: 'Rajshahi', name_bn: 'রাজশাহী' },
  { code: 'BD-RNG', name: 'Rangpur', name_bn: 'রংপুর' },
  { code: 'BD-SYL', name: 'Sylhet', name_bn: 'সিলেট' },
];

const DISTRICTS = [
  ['BD-BAR', 'BD-BAR-BGR', 'Barguna'],
  ['BD-BAR', 'BD-BAR-BAR', 'Barishal'],
  ['BD-BAR', 'BD-BAR-BHL', 'Bhola'],
  ['BD-BAR', 'BD-BAR-JKL', 'Jhalokati'],
  ['BD-BAR', 'BD-BAR-PTK', 'Patuakhali'],
  ['BD-BAR', 'BD-BAR-PRJ', 'Pirojpur'],
  ['BD-CTG', 'BD-CTG-BDB', 'Bandarban'],
  ['BD-CTG', 'BD-CTG-BRB', 'Brahmanbaria'],
  ['BD-CTG', 'BD-CTG-CDP', 'Chandpur'],
  ['BD-CTG', 'BD-CTG-CTG', 'Chattogram'],
  ['BD-CTG', 'BD-CTG-CML', 'Cumilla'],
  ['BD-CTG', 'BD-CTG-CXB', "Cox's Bazar"],
  ['BD-CTG', 'BD-CTG-FNI', 'Feni'],
  ['BD-CTG', 'BD-CTG-KGR', 'Khagrachhari'],
  ['BD-CTG', 'BD-CTG-LKM', 'Lakshmipur'],
  ['BD-CTG', 'BD-CTG-NOK', 'Noakhali'],
  ['BD-CTG', 'BD-CTG-RGM', 'Rangamati'],
  ['BD-DHA', 'BD-DHA-DHA', 'Dhaka'],
  ['BD-DHA', 'BD-DHA-FRP', 'Faridpur'],
  ['BD-DHA', 'BD-DHA-GZP', 'Gazipur'],
  ['BD-DHA', 'BD-DHA-GPL', 'Gopalganj'],
  ['BD-DHA', 'BD-DHA-KSH', 'Kishoreganj'],
  ['BD-DHA', 'BD-DHA-MDR', 'Madaripur'],
  ['BD-DHA', 'BD-DHA-MNK', 'Manikganj'],
  ['BD-DHA', 'BD-DHA-MNS', 'Munshiganj'],
  ['BD-DHA', 'BD-DHA-NRY', 'Narayanganj'],
  ['BD-DHA', 'BD-DHA-NRS', 'Narsingdi'],
  ['BD-DHA', 'BD-DHA-RBJ', 'Rajbari'],
  ['BD-DHA', 'BD-DHA-SHP', 'Shariatpur'],
  ['BD-DHA', 'BD-DHA-TNG', 'Tangail'],
  ['BD-KHU', 'BD-KHU-BGT', 'Bagerhat'],
  ['BD-KHU', 'BD-KHU-CHD', 'Chuadanga'],
  ['BD-KHU', 'BD-KHU-JSH', 'Jashore'],
  ['BD-KHU', 'BD-KHU-JHN', 'Jhenaidah'],
  ['BD-KHU', 'BD-KHU-KHU', 'Khulna'],
  ['BD-KHU', 'BD-KHU-KST', 'Kushtia'],
  ['BD-KHU', 'BD-KHU-MAG', 'Magura'],
  ['BD-KHU', 'BD-KHU-MHP', 'Meherpur'],
  ['BD-KHU', 'BD-KHU-NRL', 'Narail'],
  ['BD-KHU', 'BD-KHU-STK', 'Satkhira'],
  ['BD-MYM', 'BD-MYM-JMP', 'Jamalpur'],
  ['BD-MYM', 'BD-MYM-MYM', 'Mymensingh'],
  ['BD-MYM', 'BD-MYM-NTR', 'Netrokona'],
  ['BD-MYM', 'BD-MYM-SHP', 'Sherpur'],
  ['BD-RAJ', 'BD-RAJ-BGR', 'Bogura'],
  ['BD-RAJ', 'BD-RAJ-JYP', 'Joypurhat'],
  ['BD-RAJ', 'BD-RAJ-NGN', 'Naogaon'],
  ['BD-RAJ', 'BD-RAJ-NAT', 'Natore'],
  ['BD-RAJ', 'BD-RAJ-CWN', 'Chapai Nawabganj'],
  ['BD-RAJ', 'BD-RAJ-PBN', 'Pabna'],
  ['BD-RAJ', 'BD-RAJ-RAJ', 'Rajshahi'],
  ['BD-RAJ', 'BD-RAJ-SJG', 'Sirajganj'],
  ['BD-RNG', 'BD-RNG-DIN', 'Dinajpur'],
  ['BD-RNG', 'BD-RNG-GBD', 'Gaibandha'],
  ['BD-RNG', 'BD-RNG-KUR', 'Kurigram'],
  ['BD-RNG', 'BD-RNG-LNM', 'Lalmonirhat'],
  ['BD-RNG', 'BD-RNG-NLP', 'Nilphamari'],
  ['BD-RNG', 'BD-RNG-PCH', 'Panchagarh'],
  ['BD-RNG', 'BD-RNG-RNG', 'Rangpur'],
  ['BD-RNG', 'BD-RNG-THG', 'Thakurgaon'],
  ['BD-SYL', 'BD-SYL-HAB', 'Habiganj'],
  ['BD-SYL', 'BD-SYL-MOU', 'Moulvibazar'],
  ['BD-SYL', 'BD-SYL-SUN', 'Sunamganj'],
  ['BD-SYL', 'BD-SYL-SYL', 'Sylhet'],
];

function deterministicUuid(code) {
  const hash = createHash('sha256').update(`cropsy-farm-geo:${code}`).digest('hex');
  const variant = ((Number.parseInt(hash.slice(16, 17), 16) & 0x3) | 0x8).toString(16);
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-${variant}${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

function createBangladeshGeoFixture() {
  const divisions = DIVISIONS.map((division) => ({
    id: deterministicUuid(division.code),
    country_code: 'BD',
    code: division.code,
    name: division.name,
    name_bn: division.name_bn,
  }));
  const divisionByCode = new Map(divisions.map((division) => [division.code, division]));

  const districts = DISTRICTS.map(([divisionCode, code, name]) => ({
    id: deterministicUuid(code),
    country_code: 'BD',
    code,
    name,
    division_id: divisionByCode.get(divisionCode).id,
  }));

  const districtByCode = new Map(districts.map((district) => [district.code, district]));

  const upazilas = districts.map((district) => {
    const code = `${district.code}-S`;
    return {
      id: deterministicUuid(code),
      country_code: 'BD',
      code,
      name: `${district.name} Sadar`,
      district_id: district.id,
    };
  });
  const unions = upazilas.map((upazila) => {
    const code = `${upazila.code.slice(0, -2)}-U`;
    return {
      id: deterministicUuid(code),
      country_code: 'BD',
      code,
      name: `${upazila.name} Union`,
      upazila_id: upazila.id,
    };
  });
  const unionByUpazila = new Map(unions.map((union) => [union.upazila_id, union]));

  return {
    divisions,
    districts,
    upazilas,
    unions,
    divisionByCode,
    districtByCode,
    unionByUpazila,
  };
}

module.exports = {
  createBangladeshGeoFixture,
  deterministicUuid,
};
