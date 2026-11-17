# One-off transformation of gmic.cpp (3.7.2.2) so that Emscripten can compile gmic::_run (see dep-gmic.patch).
import re,sys
p=sys.argv[1]
s=open(p).read()

def skip(s,i):
    """return index after string/char/comment starting at i, or i if none"""
    c=s[i]
    if c=='"' or c=="'":
        j=i+1
        while s[j]!=c:
            j+= 2 if s[j]=='\\' else 1
        return j+1
    if s.startswith('//',i):
        return s.index('\n',i)
    if s.startswith('/*',i):
        return s.index('*/',i)+2
    return i
def match(s,i):
    """s[i]=='{' -> index of matching '}'"""
    assert s[i]=='{'
    d=0
    while True:
        j=skip(s,i)
        if j!=i: i=j; continue
        if s[i]=='{': d+=1
        elif s[i]=='}':
            d-=1
            if d==0: return i
        i+=1

start=s.index('gmic& gmic::_run(const CImgList<char>& command_line, unsigned int& position,')
# 1. recursion sites: try { ..._run(...) } catch (gmic_exception &e) { ... }
n=0
while True:
    found=None
    for m in re.finditer(r'try \{\n(?:(?!try \{).)*?\b_run\(', s[start:], re.S):
        t=start+m.start(); bb=t+4; e=match(s,bb)
        mm=re.match(r'\s*catch \(gmic_exception &(\w+)\) \{',s[e+1:])
        if mm: found=(t,bb,e,mm.group(1),e+1+mm.end()-1)
    if not found: break
    t,bb,e,name,cb=found; ce=match(s,cb)
    s=s[:t]+'{ gmic_exception %s; if (!gmic_wasm_catch(%s,[&]() {%s})) {%s} }'%(name,name,s[bb+1:e],s[cb+1:ce])+s[ce+1:]
    n+=1
print(n,'recursion sites',file=sys.stderr)

# 2. body of _run in a lambda that is not compiled with exception catching
a='  try {\n\n    // Init interpreter environment.'
assert s.count(a)==1
s=s.replace(a,'  try {\n    [&]() __attribute__((noinline)) { // gmic_wasm: see gmic_wasm_catch()\n\n    // Init interpreter environment.')
b='    verbosity = starting_verbosity;\n\n  } catch (gmic_exception&) {\n    // Wait for remaining threads to finish.'
assert s.count(b)==1
s=s.replace(b,'    verbosity = starting_verbosity;\n    }();\n\n  } catch (gmic_exception&) {\n    // Wait for remaining threads to finish.')

# 3. helper
h='''// WebAssembly (Emscripten, exceptions through JavaScript): lowering the exception handling of gmic::_run, a single
// function of about 10000 lines, takes more than 8 GB of memory. The body of gmic::_run is therefore moved into a
// lambda that is compiled WITHOUT exception catching (engine/build-deps.sh passes every other function of this
// file to -emscripten-cxx-exceptions-allowed). Inside that lambda 'catch' clauses never run, and destructors are
// not run when an exception passes through it. The calls that must catch gmic_exception (local blocks, 'onfail',
// custom commands) go through this function instead.
template<typename F> static bool gmic_wasm_catch(gmic_exception &e, F f) {
  try { f(); return true; }
  catch (gmic_exception &e2) { cimg::swap(e._command,e2._command); cimg::swap(e._message,e2._message); return false; }
}

'''
k='// Main parsing procedures.\n//-------------------------\n'
assert s.count(k)==1
s=s.replace(k,h+k)
open(p,'w').write(s)
