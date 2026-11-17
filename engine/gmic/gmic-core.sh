#!/usr/bin/env bash
# Compiles the G'MIC core (gmic.cpp, patched by patches/dep-gmic.patch) into $GP/lib/libgmic.a
# usage: gmic-core.sh [-O1|-O2]
source /home/user/Krita-Web-Port/engine/env.sh
O=${1:--O1}; GP=$KW/prefix-gmic
S=$KW/src/gmic/src; B=$KW/build/gmic; mkdir -p $B; cd $B
F=(-pthread -msimd128 -fexceptions -I$PREFIX/include -I$GP/include "-Dcimg_appname=\"gmic\"" -Dcimg_use_cpp11=1 -Dgmic_core -Dgmic_community
   -Dcimg_use_abort -Dgmic_is_parallel -D_IS_UNIX_ -Dcimg_display=0 -Dcimg_use_png -Dcimg_use_zlib -Dcimg_use_fftw3
   -Dcimg_use_fftw3_singlethread -DNDEBUG)
# 1. cheap front-end pass: the names of all functions in the file
em++ -O0 "${F[@]}" -S -emit-llvm $S/gmic.cpp -o gmic.ll || exit 1
# 2. every function except gmic::_run and its body lambda gets exception catching (see the comment in gmic.cpp)
grep '^define' gmic.ll | sed -E 's/^[^@]*@([^(]*)\(.*/\1/' | grep -v -E '^_ZZ?N4gmic4_runI' | sort -u > allowed.txt
echo "$(wc -l < allowed.txt) functions allowed, $(grep -c -E '^_ZZ?N4gmic4_runI' <(grep '^define' gmic.ll | sed -E 's/^[^@]*@([^(]*)\(.*/\1/')) left out"
# the option takes comma separated lists and can be repeated; one argument may not exceed 128 KB
A=(); while read -r l; do A+=(-mllvm "-emscripten-cxx-exceptions-allowed=$l"); done < <(awk 'BEGIN{ORS=""} {if (n+length($0)>100000) {print "\n"; n=0} if (n) {print ","; n++} print $0; n+=length($0)} END{print "\n"}' allowed.txt)
em++ $O "${F[@]}" "${A[@]}" -c $S/gmic.cpp -o gmic.o || exit 1
rm -f $GP/lib/libgmic.a; emar rcs $GP/lib/libgmic.a gmic.o
