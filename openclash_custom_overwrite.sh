#!/bin/sh
. /lib/functions.sh
. /usr/share/openclash/ruby.sh
. /usr/share/openclash/log.sh

LOG_TIP "Start Running Custom Overwrite Scripts..."
LOGTIME=$(echo $(date "+%Y-%m-%d %H:%M:%S"))
LOG_FILE="/tmp/openclash.log"
CONFIG_FILE="$1"

tolerance=$(uci_get openclash config tolerance)
urltest=$(uci_get openclash config urltest_address_mod)
interval=$(uci_get openclash config urltest_interval_mod)
smart_enable_lgbm=$(uci_get openclash config smart_enable_lgbm)
auto_smart_switch=$(uci_get openclash config auto_smart_switch)
GROUP_TYPE=$([ "$smart_enable_lgbm" = "1" -a "$auto_smart_switch" = "1" ] && echo "smart" || echo "url-test")

run_ruby_part "
  Value = YAML.load_file('$CONFIG_FILE')
  c_int  = '$interval' == '0' ? 86400 : '$interval'.to_i
  c_url  = '$urltest'  == '0' ? 'http://www.gstatic.com/generate_204' : '$urltest'
  c_icon = 'https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/mini'
  region_data = [
    ['香港自动选择', '港|hk',                            'HK'],
    ['台湾自动选择', '台|tw|taiwan',                     'TW'],
    ['日本自动选择', '日|jp|japan',                      'JP'],
    ['美国自动选择', '美|us|unitedstates|united states', 'US'],
    ['新加坡自动选择', '新|sg|singapore',                'SG']
  ]

  ai_group = {
    'name'            => 'AI',
    'type'            => '$GROUP_TYPE',
    'lazy'            => false,
    'interval'        => c_int,
    'include-all'     => true,
    'expected-status' => 204,
    'filter'          => '(?i)^(?!.*(剩余|到期|域名|俄罗斯|土耳其|印度|港|HK|国内)).*$',
    'url'             => c_url,
    'icon'            => c_icon + '/Global.png'
  }
  .merge('$tolerance'.to_i > 0 ? { 'tolerance' => '$tolerance'.to_i } : {})
  .merge('$GROUP_TYPE' == 'smart' ? { 'uselightgbm' => true, 'collectdata' => true, 'sample-rate' => 1.0, 'prefer-asn' => true } : {})

  (Value['proxy-groups'] ||= []).concat(
    [ai_group] + region_data.map { |name, filter, icon|
      { 'name' => name, 'type' => 'url-test', 'lazy' => false,
        'interval' => c_int,'include-all' => true, 'expected-status' => 204,
        'filter' => '(?i)(' + filter + ')', 'url' => c_url,
        'icon' => c_icon + '/' + icon + '.png' }
    }
  )

  Value['ntp'] = {
    'enable'          => true,
    'port'            => 123,
    'interval'        => 30,
    'write-to-system' => true,
    'server'          => 'time.apple.com',
  }.merge(Value['ntp'] || {})

  Value['dns'] = (Value['dns'] || {}).merge({
    'cache-algorithm' => 'arc',
    'max-size'        => 8192,
    'fake-ip-filter'  => ['rule-set:fakeipfilter_domain'],
    'nameserver-policy' => {
      'rule-set:ads_domain'     => ['rcode://success'],
      'rule-set:private_domain' => ['223.5.5.5', '119.29.29.29'],
      'rule-set:cn_domain'      => ['https://doh.pub/dns-query', 'https://dns.alidns.com/dns-query']
    }
  })

  if Value['sniffer'] && Value['sniffer']['enable']
    Value['sniffer']['skip-domain'] ||= []
    Value['sniffer']['skip-domain'] |= ['rule-set:ads_domain', 'rule-set:pt_classical']
  end

  meta_geo = 'https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo'
  providers = {
    'private_domain'      => { behavior: 'domain',    url: meta_geo + '/geosite/private.mrs' },
    'ai_domain'           => { behavior: 'domain',    url: meta_geo + '/geosite/category-ai-!cn.mrs' },
    'youtube_domain'      => { behavior: 'domain',    url: meta_geo + '/geosite/youtube.mrs' },
    'google_domain'       => { behavior: 'domain',    url: meta_geo + '/geosite/google.mrs' },
    'github_domain'       => { behavior: 'domain',    url: meta_geo + '/geosite/github.mrs' },
    'telegram_domain'     => { behavior: 'domain',    url: meta_geo + '/geosite/telegram.mrs' },
    'netflix_domain'      => { behavior: 'domain',    url: meta_geo + '/geosite/netflix.mrs' },
    'paypal_domain'       => { behavior: 'domain',    url: meta_geo + '/geosite/paypal.mrs' },
    'onedrive_domain'     => { behavior: 'domain',    url: meta_geo + '/geosite/onedrive.mrs' },
    'microsoft_domain'    => { behavior: 'domain',    url: meta_geo + '/geosite/microsoft.mrs' },
    'apple_domain'        => { behavior: 'domain',    url: meta_geo + '/geosite/apple.mrs' },
    'speedtest_domain'    => { behavior: 'domain',    url: meta_geo + '/geosite/ookla-speedtest.mrs' },
    'tiktok_domain'       => { behavior: 'domain',    url: meta_geo + '/geosite/tiktok.mrs' },
    'geolocation'         => { behavior: 'domain',    url: meta_geo + '/geosite/geolocation-!cn.mrs' },
    'cn_domain'           => { behavior: 'domain',    url: meta_geo + '/geosite/cn.mrs' },
    'ads_domain'          => { behavior: 'domain',    url: meta_geo + '/geosite/category-ads-all.mrs' },
    'cdn'                 => { behavior: 'domain',    url: meta_geo + '/geosite/category-cdn-cn.mrs' },
    'cdn!'                => { behavior: 'domain',    url: meta_geo + '/geosite/category-cdn-!cn.mrs' },
    'fakeipfilter_domain' => { behavior: 'domain',    url: 'https://raw.githubusercontent.com/wwqgtxx/clash-rules/release/fakeip-filter.mrs' },

    'private_ip'          => { behavior: 'ipcidr',    url: meta_geo + '/geoip/private.mrs' },
    'cn_ip'               => { behavior: 'ipcidr',    url: meta_geo + '/geoip/cn.mrs' },
    'google_ip'           => { behavior: 'ipcidr',    url: meta_geo + '/geoip/google.mrs' },
    'telegram_ip'         => { behavior: 'ipcidr',    url: meta_geo + '/geoip/telegram.mrs' },
    'netflix_ip'          => { behavior: 'ipcidr',    url: meta_geo + '/geoip/netflix.mrs' },
    'apple_ip'            => { behavior: 'ipcidr',    url: 'https://raw.githubusercontent.com/MetaCubeX/meta-lite/geoip/apple.mrs' },

    'ai_classical'        => { behavior: 'classical', url: meta_geo + '/geosite/classical/category-ai-!cn.yaml' },
    'pt_classical'        => { behavior: 'classical', url: meta_geo + '/geosite/classical/category-pt.yaml' }
  }

  FORMATS = { 'classical' => 'yaml' }.tap { |h| h.default = 'mrs' }
  Value['rule-providers'] = providers.transform_values { |cfg|
    { 'type' => 'http', 'format' => FORMATS[cfg[:behavior].to_s],
      'interval' => 86400, 'behavior' => cfg[:behavior].to_s, 'url' => cfg[:url] }
  }.merge(Value['rule-providers'] || {})

  Value['proxy-groups']&.each do |g|
    next unless g['name'] == '自动选择'
    g['proxies']&.select! { |p| p =~ /日本|香港|HK|新加坡|台湾|美国/ }
  end

  (Value['proxies'] ||= []).unshift({
    'name' => '国内', 'type' => 'direct'
  })

  Value['rules'] = [
      'RULE-SET,private_domain,国内',
      'RULE-SET,private_ip,国内,no-resolve',
      'SRC-IP-CIDR,192.168.2.116/32,国内,no-resolve',
      'RULE-SET,ads_domain,REJECT',
      'RULE-SET,pt_classical,国内',

      'RULE-SET,ai_domain,AI',
      'RULE-SET,ai_classical,AI',
      'RULE-SET,youtube_domain,NCloud',
      'RULE-SET,google_domain,NCloud',
      'RULE-SET,google_ip,NCloud,no-resolve',
      'RULE-SET,github_domain,NCloud',
      'RULE-SET,telegram_domain,NCloud',
      'RULE-SET,telegram_ip,NCloud,no-resolve',
      'RULE-SET,netflix_domain,NCloud',
      'RULE-SET,netflix_ip,NCloud,no-resolve',
      'RULE-SET,tiktok_domain,NCloud',
      'RULE-SET,paypal_domain,NCloud',
      'RULE-SET,onedrive_domain,国内',
      'RULE-SET,microsoft_domain,国内',
      'RULE-SET,apple_domain,国内',
      'RULE-SET,apple_ip,国内,no-resolve',
      'RULE-SET,speedtest_domain,国内',

      'RULE-SET,cn_domain,国内',
      'RULE-SET,cdn,国内',
      'RULE-SET,cdn!,NCloud',
      'RULE-SET,geolocation,NCloud',
      'RULE-SET,cn_ip,国内,no-resolve',
      'MATCH,NCloud'
  ] #+ (Value['rules'] || [])

  File.open('$CONFIG_FILE', 'w') { |f| YAML.dump(Value, f) }
"
exit 0
