// Municipality/City and Barangay mapping for dependent dropdowns
// Source: user-provided lists

export const MUNICIPALITIES = [
  "Isabel",
  "Merida",
  "Palompon",
  "Ormoc",
  "Matag-ob",
];

export const BARANGAYS = {
  Isabel: [
    "Anislag","Antipolo","Apale","Bantigue","Binog","Bilwang","Can-andan","Cangag","Consolacion","Honan","Libertad","Mahayag","Marvel (Poblacion)","Matlang","Monte Alegre","Puting Bato","San Francisco","San Roque","Santa Cruz Relocation","Santo Niño (Poblacion)","Santo Rosario","Tabunok","Tolingon","Tubod",
  ],
  Merida: [
    "Benabaye","Cabaliwan","Calunangan","Calunasan","Cambalong","Can-unzo","Canbantug","Casilda","Lamanoc","Libas","Libjo","Lundag","Macario","Mahalit","Mahayag","Masumbang","Mat-e","Poblacion","Puerto Bello","San Isidro","San Jose","Tubod",
  ],
  Palompon: [
    "Baguinbin","Belen","Buenavista","Caduhaan","Cambakbak","Cambinoy","Cangcosme","Cangmuya","Canipaan","Cantandoy","Cantuhaon","Catigahan","Central 1 (Poblacion)","Central 2 (Poblacion)","Cruz","Duljugan","Guiwan 1 (Poblacion)","Guiwan 2 (Poblacion)","Himarco","Hinablayan (Poblacion)","Hinagbuan","Lat-osan","Liberty","Lomonon","Mabini","Magsaysay","Masaba","Mazawalo (Poblacion)","Parilla","Pinagdait (Poblacion Ypil I)","Pinaghi-usa (Poblacion Ypil II)","Plaridel","Rizal","Sabang","San Guillermo","San Isidro","San Joaquin","San Juan","San Miguel","San Pablo","San Pedro","San Roque","Santiago","Taberna","Tabunok","Tambis","Tinabilan","Tinago","Tinubdan","Bitaog (Poblacion Ypil III)",
  ],
  Ormoc: [
    "Airport","Alegria","Alta Vista","Bagongbong","Bagong Buhay","Bantigue","Batuan","Bayog","Biliboy","Borok","Cabaon-an","Cabintan","Cabulihan","Cagbuhangin","Camp Downes","Can-adieng","Can-untog","Catmon","Cogon Combado","Concepcion","Curva","Danhug","Dayhagan","Dolores","Domonar","Don Felipe Larrazabal","Don Potenciano Larrazabal","Doña Feliza Z. Mejia","Donghol","Esperanza","Gaas","Green Valley","Guintigui-an","Hibunawon","Hugpa","Ipil","Juaton","Kadaohan","Labrador (Balion)","Lao","Leondoni","Libertad","Liberty","Licuma","Liloan","Linao","Luna","Mabato","Mabini","Macabug","Magaswi","Mahayag","Mahayahay","Manlilinao","Margen","Mas-in","Matica-a","Milagro","Monterico","Nasunogan","Naungan","Nueva Sociedad","Nueva Vista","Patag","Punta","Quezon Jr.","Rufina M. Tan (Rawis)","Sabang Bao","Salvacion","San Antonio","San Isidro","San Jose","San Juan","San Pablo (Simangan)","San Vicente","Santo Niño","Sumangga","Tambulilid","Tongonan","Valencia","East (Poblacion)","West (Poblacion)","North (Poblacion)","South (Poblacion)",
  ],
  "Matag-ob": [
    "Balagtas","Bonoy","Bulak","Cambadbad","Candelaria","Cansoso","Imelda","Malazarte","Mansaha-on","Mansalip","Masaba","Naulayan","Riverside (Poblacion)","San Dionesio","San Guillermo (Poblacion)","San Marcelino","San Sebastian","San Vicente","Santa Rosa","Santo Rosario","Talisay (Poblacion)",
  ],
};

export function getBarangays(municipality) {
  return BARANGAYS[municipality] || [];
}
