// Runs before main() of every test: select the display-less Qt platform and fontconfig file.
#include <stdlib.h>
namespace { struct Env { Env() { setenv("QT_QPA_PLATFORM", "kritaheadless", 1); setenv("FONTCONFIG_FILE", "/etc/fonts/fonts.conf", 1); } } env; }
