#

product="Secure My Password Manager"
version=$(version manifest.json);
build=$(version --build content.js);

echo "v$version -- $build (background.js)"

sed -e "s/\"version\": .*,/\"version\": \"$version\",/" \
    -e "s/\"name\": .*,/\"name\": \"${product} ~ $build\",/" \
    manifest-tmpl.json > manifest.json

echo "--- # ${product} extension information" > info.yml
echo "manifest_version: $version" >> info.yml
version --yaml --all background.js >> info.yml
cat >> info.yml <<EOT
content_build: $build
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
