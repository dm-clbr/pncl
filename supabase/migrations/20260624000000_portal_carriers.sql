create table if not exists portal_carriers (
  id uuid primary key default gen_random_uuid(),
  carrier text not null default '',
  company_number text not null default '',
  e_app_label text not null default '',
  e_app_url text,
  sort_order integer not null default 0,
  published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists portal_carriers_sort_order_idx
  on portal_carriers (sort_order asc, created_at asc);

alter table portal_carriers enable row level security;

create policy "Authenticated users can read published carriers"
  on portal_carriers
  for select
  to authenticated
  using (published = true);

insert into portal_carriers (carrier, company_number, e_app_label, e_app_url, sort_order, published)
values
  ('ETHOS', '', '', null, 0, true),
  (
    'Mutual Of Omaha',
    '800-775-6000',
    'MOO',
    'https://producer.mutualofomaha.com/enterprise/myportal/home/welcome/!ut/p/z1/04_Sj9CPykssy0xPLMnMz0vMAfIjo8zind0dPUzMfQwM3J2NzA0cDbw9vNzcDQwNXA30wwkpiAJKG-AAjiD9UWAlcBMsTI1cwCZYmJoaGxt4mkEV4DGjIDfCINNRUREARwKK3g!!/dz/d5/L2dBISEvZ0FBIS9nQSEh/',
    1,
    true
  ),
  (
    'Transamerica',
    '866-545-9058',
    'Tranz',
    'https://secure.transamerica.com/login/sign-in/login.html?requestUrl=/pkmslogout?dummy=dummy&token=605ed448-2cec-11f0-ae0a-74fe4838a05a',
    2,
    true
  ),
  (
    'COMBINE',
    '800-888-2452',
    'Combined',
    'https://chubb.insuranceadmin.com/home',
    3,
    true
  ),
  (
    'American General Life (Corebridge)',
    '800-247-8837',
    'Corbridge',
    'https://www.connext.corebridgefinancial.com/life/connext-portal/app/home/underwriting/siwl',
    4,
    true
  ),
  (
    'American Home Life',
    '866-272-6630',
    'AHL',
    'https://www.aetnaseniorproducts.com/ssibrokerwebsecure/amh/login.fcc?TYPE=33554433&REALMOID=06-8833a054-6469-49fd-b80c-d5c3ce33aed7&GUID=&SMAUTHREASON=0&METHOD=GET&SMAGENTNAME=-SM-s7pFJAUCnH5Qp3pzu1lx8MibbZnWT%2b01G%2f6iCkHVxMsS0hd%2fsbmjhWe16MOGqvFRrS17O3IrRUBJqyBYHEvE5IyHDS9KZnck&TARGET=-SM-HTTPS%3a%2f%2fwww%2eaetnaseniorproducts%2ecom%2fssibrokerwebsecure%2famh%2fhome%2ehtml',
    5,
    true
  ),
  (
    'Liberty Bankers Life Ins Co',
    '800-731-4300',
    'liberty Bankers',
    'https://agent.lbig.com/eapp',
    6,
    true
  ),
  ('NLG', '', '', null, 7, true),
  (
    'North American Company',
    '877-872-0757',
    'North American',
    'https://www.northamericancompany.com/web/nacolah-portal/naloginpage?service=https://www.prd.northamericancompany.com/group/nacolah-portal/li-agent-homepage',
    8,
    true
  ),
  ('F&G', '', 'F&G', 'https://saleslink.fglife.com/', 9, true),
  (
    'Royal Neighbors of America',
    '',
    'Royal',
    'https://agent.royalneighbors.org/secure',
    10,
    true
  ),
  (
    'Kansas City Life',
    '800-572-2467, ext. 6411',
    '',
    null,
    11,
    true
  ),
  (
    'FORRESTERS',
    '866-466-7166',
    'myezbiz.foresters.com',
    'https://myezbiz.foresters.com/',
    12,
    true
  ),
  (
    'BANNER',
    '',
    'Banner',
    'https://partner.bannerlife.com/dashboard#?startDateCleared=false&endDateCleared=false&isLgaStaff=false&pageIndex=0&pageSize=6&sortColumn=lastActivityDate&sortDirection=1',
    13,
    true
  ),
  ('American Amlicable', '', '', null, 14, true);
