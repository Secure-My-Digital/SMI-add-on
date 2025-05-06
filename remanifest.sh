#

product="Secure My Password Manager"
version=$(version manifest.json);
build=$(version --build manifest.json);
jsfile=background.js

echo "v$version -- $build (manifest-tmpl.json)"
sed -e "s/\"version\": .*,/\"version\": \"$version\",/" \
    -e "s/\"name\": .*,/\"name\": \"${product}\",/" \
    manifest-tmpl.json > manifest.json

sed -e "s/\"version\": .*,/\"version\": \"$version\",/" \
    -e "s/\"name\": .*,/\"name\": \"${product}\",/" \
    -e "s/\"build\": .*,/\"build\": \"${build}\",/"  config-tmpl.json > config.json

echo "--- # ${product} extension information" > info.yml
echo "manifest_version: $version" >> info.yml
echo "manifest_build: $build" >> info.yml
version --yaml --all background.js >> info.yml
cat >> info.yml <<EOT
author: $USER
EOT
json_xs -f yaml -t json-pretty < info.yml > info.json

noncefile=$(nonce.pl -d /tmp | grep file | cut -d' ' -f 2)
ls -l $noncefile
ipfs files rm -r $noncefile >/dev/null 2>&1
qm=$(ipfs add --pin=false -r . -Q --to-files $noncefile)
ipfs files write --create --truncate --parents  $noncefile/nonce.yml $noncefile
rm -f "$noncefile"
qmsign=$(ipfs files stat --hash $noncefile)
ipfs files rm -r $noncefile
echo "hash: $qmsign" >> info.yml
ipfs files rm $noncefile/nonce.yml

echo "# \$Source: https://ipfs.securemy.digital/ipfs/$qm \$" >> info.yml
json_xs -f yaml -t json-pretty < info.yml > info.json

sed -e "s/\"version\": .*,/\"version\": \"$version\",/" \
    -e "s/\"name\": .*,/\"name\": \"${product}\",/" \
    -e "s/\"build\": .*,/\"build\": \"${build}\",/" \
    -e "s/\"qm\": .*,/\"qm\": \"${qm}\",/" config-tmpl.json > config.json

