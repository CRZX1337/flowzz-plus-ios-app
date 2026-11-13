#!/usr/bin/env python3
"""Static validation for the flowzz+ iOS Safari web extension scaffold.

Runs without Xcode and without third-party packages, so it works on Linux and in
CI. It parses project.pbxproj (OpenStep plist syntax), resolves the group tree,
checks the target graph and validates the extension resources against
manifest.json.

It cannot replace a real build. It does catch the mistakes that break an
integration: missing files, unresolved object references, a missing embed phase,
a missing target dependency, wrong product types, wrong extension point, bundle
identifier mismatches and a manifest that points at files which do not exist.

Usage: python3 tools/validate-project.py [--root PATH]
"""

from __future__ import annotations

import json
import os
import plistlib
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROJECT = os.path.join(ROOT, "FlowzzPlus.xcodeproj", "project.pbxproj")
HEX24 = re.compile(r"\b[0-9A-F]{24}\b")
ID_OK = re.compile(r"^[A-Za-z0-9.-]+$")

failures: list[str] = []
checks = 0


def check(condition: bool, message: str) -> bool:
    global checks
    checks += 1
    if not condition:
        failures.append(message)
    return bool(condition)


def fail(message: str) -> None:
    check(False, message)


# --------------------------------------------------------------------------- #
# Minimal OpenStep plist parser (the format project.pbxproj uses)
# --------------------------------------------------------------------------- #

class Parser:
    def __init__(self, text: str) -> None:
        self.text = text
        self.pos = 0

    def error(self, message: str) -> None:
        line = self.text.count("\n", 0, self.pos) + 1
        raise ValueError(f"project.pbxproj line {line}: {message}")

    def skip(self) -> None:
        while self.pos < len(self.text):
            char = self.text[self.pos]
            if char in " \t\r\n":
                self.pos += 1
            elif self.text.startswith("//", self.pos):
                end = self.text.find("\n", self.pos)
                self.pos = len(self.text) if end == -1 else end + 1
            elif self.text.startswith("/*", self.pos):
                end = self.text.find("*/", self.pos + 2)
                if end == -1:
                    self.error("unterminated comment")
                self.pos = end + 2
            else:
                return

    def parse(self) -> dict:
        value = self.value()
        if not isinstance(value, dict):
            self.error("root object is not a dictionary")
        return value

    def value(self):
        self.skip()
        if self.pos >= len(self.text):
            self.error("unexpected end of file")
        char = self.text[self.pos]
        if char == "{":
            return self.dictionary()
        if char == "(":
            return self.array()
        if char == '"':
            return self.quoted()
        return self.bare()

    def dictionary(self) -> dict:
        self.pos += 1
        result = {}
        while True:
            self.skip()
            if self.pos >= len(self.text):
                self.error("unterminated dictionary")
            if self.text[self.pos] == "}":
                self.pos += 1
                return result
            key = self.value()
            if not isinstance(key, str):
                self.error("dictionary key is not a string")
            self.skip()
            if self.pos >= len(self.text) or self.text[self.pos] != "=":
                self.error(f"expected '=' after key {key!r}")
            self.pos += 1
            result[key] = self.value()
            self.skip()
            if self.pos < len(self.text) and self.text[self.pos] == ";":
                self.pos += 1

    def array(self) -> list:
        self.pos += 1
        result = []
        while True:
            self.skip()
            if self.pos >= len(self.text):
                self.error("unterminated array")
            if self.text[self.pos] == ")":
                self.pos += 1
                return result
            result.append(self.value())
            self.skip()
            if self.pos < len(self.text) and self.text[self.pos] == ",":
                self.pos += 1

    def quoted(self) -> str:
        self.pos += 1
        chars = []
        while self.pos < len(self.text):
            char = self.text[self.pos]
            if char == "\\":
                self.pos += 1
                if self.pos >= len(self.text):
                    self.error("unterminated escape")
                chars.append(self.text[self.pos])
                self.pos += 1
            elif char == '"':
                self.pos += 1
                return "".join(chars)
            else:
                chars.append(char)
                self.pos += 1
        self.error("unterminated string")

    def bare(self) -> str:
        start = self.pos
        while self.pos < len(self.text) and self.text[self.pos] not in " \t\r\n{}()=;,\"":
            self.pos += 1
        if start == self.pos:
            self.error(f"unexpected character {self.text[self.pos]!r}")
        return self.text[start:self.pos]


# --------------------------------------------------------------------------- #
# Load
# --------------------------------------------------------------------------- #

with open(PROJECT, encoding="utf-8") as handle:
    text = handle.read()

project = Parser(text).parse()
objects: dict = project["objects"]


def obj(object_id: str) -> dict:
    value = objects.get(object_id)
    if not isinstance(value, dict):
        fail(f"reference {object_id} does not resolve to an object")
        return {}
    return value


def config_settings(config_list_id: str, configuration: str):
    config_list = obj(config_list_id or "")
    for config_id in config_list.get("buildConfigurations", []):
        config = obj(config_id)
        if config.get("name") == configuration:
            return config.get("buildSettings", {})
    return None


def build_settings(target_id: str, configuration: str) -> dict:
    """Target settings with the project level settings they inherit merged in."""
    inherited = config_settings(root.get("buildConfigurationList"), configuration) or {}
    target = obj(target_id)
    own = config_settings(target.get("buildConfigurationList"), configuration)
    if own is None:
        fail(f"no {configuration} configuration for target {target.get('name')}")
        own = {}
    merged = dict(inherited)
    merged.update(own)
    return merged


def resolved_build_setting(settings: dict, key: str) -> str:
    """Expand simple $(SETTING) references using merged project/target settings."""
    value = str(settings.get(key, ""))
    for _ in range(8):
        references = re.findall(r"\$\(([^)]+)\)", value)
        if not references:
            break
        for reference in references:
            value = value.replace(f"$({reference})", str(settings.get(reference, "")))
    return value


# --------------------------------------------------------------------------- #
# 1. Object graph integrity
# --------------------------------------------------------------------------- #

defined = set(objects)
for token in set(HEX24.findall(text)):
    check(token in defined, f"object id {token} is referenced but never defined")

root_id = project.get("rootObject")
check(bool(root_id), "project has no rootObject")
root = obj(root_id) if root_id else {}
check(root.get("isa") == "PBXProject", "rootObject is not a PBXProject")

# --------------------------------------------------------------------------- #
# 2. Targets
# --------------------------------------------------------------------------- #

targets = root.get("targets", [])
check(len(targets) == 2, f"expected 2 targets, found {len(targets)}")

host_id = ext_id = ""
for target_id in targets:
    target = obj(target_id)
    product_type = target.get("productType")
    if product_type == "com.apple.product-type.application":
        host_id = target_id
    elif product_type == "com.apple.product-type.app-extension":
        ext_id = target_id

check(bool(host_id), "no iOS application target found")
check(bool(ext_id), "no app-extension target found")

for target_id in (host_id, ext_id):
    if not target_id:
        continue
    target = obj(target_id)
    for ref_key in ("productReference", "buildConfigurationList"):
        check(bool(target.get(ref_key)), f"target {target.get('name')} has no {ref_key}")
    product = obj(target.get("productReference", ""))
    expected_suffix = ".app" if target_id == host_id else ".appex"
    check(
        str(product.get("path", "")).endswith(expected_suffix),
        f"target {target.get('name')} product does not end with {expected_suffix}",
    )

host_name = obj(host_id).get("name", "") if host_id else ""
ext_name = obj(ext_id).get("name", "") if ext_id else ""

# --------------------------------------------------------------------------- #
# 3. Embedding and dependency
# --------------------------------------------------------------------------- #

if host_id and ext_id:
    host = obj(host_id)
    phases = [obj(phase_id) for phase_id in host.get("buildPhases", [])]
    embed = [phase for phase in phases if phase.get("isa") == "PBXCopyFilesBuildPhase"]
    check(bool(embed), "host target has no copy-files build phase")
    check(
        any(phase.get("dstSubfolderSpec") == "13" for phase in embed),
        "host target embeds nothing into the PlugIns folder (dstSubfolderSpec 13)",
    )

    appex_ref = obj(ext_id).get("productReference")
    embedded = False
    signed = False
    for phase in embed:
        for build_file_id in phase.get("files", []):
            build_file = obj(build_file_id)
            if build_file.get("fileRef") == appex_ref:
                embedded = True
                attributes = build_file.get("settings", {}).get("ATTRIBUTES", [])
                signed = "CodeSignOnCopy" in attributes
    check(embedded, "extension product is not in the embed build phase")
    check(signed, "embedded extension is not signed on copy (CodeSignOnCopy)")

    dependencies = [obj(dep_id) for dep_id in host.get("dependencies", [])]
    check(
        any(dep.get("target") == ext_id for dep in dependencies),
        "host target does not depend on the extension target",
    )
    for dep in dependencies:
        proxy = obj(dep.get("targetProxy", ""))
        check(proxy.get("isa") == "PBXContainerItemProxy", "target dependency has no container proxy")
        if proxy:
            check(
                proxy.get("containerPortal") == root_id,
                "target dependency proxy does not point at this project",
            )
            check(
                proxy.get("remoteGlobalIDString") == ext_id,
                "target dependency proxy points at the wrong target",
            )

# --------------------------------------------------------------------------- #
# 4. File references resolve on disk
# --------------------------------------------------------------------------- #

resolved: dict[str, str] = {}


def walk_group(group_id: str, prefix: str) -> None:
    group = obj(group_id)
    path = prefix
    if group.get("path"):
        path = os.path.join(prefix, group["path"])
    for child_id in group.get("children", []):
        child = objects.get(child_id)
        if not isinstance(child, dict):
            fail(f"group {group_id} has an unresolved child {child_id}")
            continue
        if child.get("isa") in ("PBXGroup", "PBXVariantGroup"):
            walk_group(child_id, path)
        elif child.get("isa") == "PBXFileReference":
            if child.get("sourceTree", "<group>") != "<group>":
                # Built products (BUILT_PRODUCTS_DIR, SDKROOT) have no source path.
                continue
            resolved[child_id] = os.path.join(path, child.get("path", ""))
            check(
                os.path.exists(os.path.join(ROOT, resolved[child_id])),
                f"file referenced by Xcode does not exist: {resolved[child_id]}",
            )


walk_group(root.get("mainGroup", ""), "")

# --------------------------------------------------------------------------- #
# 5. Info.plists
# --------------------------------------------------------------------------- #

plists: dict[str, dict] = {}
for target_id, label in ((host_id, "host"), (ext_id, "extension")):
    if not target_id:
        continue
    for configuration in ("Debug", "Release"):
        settings = build_settings(target_id, configuration)
        check(
            settings.get("GENERATE_INFOPLIST_FILE") == "NO",
            f"{label} target {configuration} generates an Info.plist instead of using a file",
        )
        relative = settings.get("INFOPLIST_FILE")
        if not check(bool(relative), f"{label} target {configuration} has no INFOPLIST_FILE"):
            continue
        absolute = os.path.join(ROOT, relative)
        if not check(os.path.exists(absolute), f"{label} Info.plist missing: {relative}"):
            continue
        with open(absolute, "rb") as handle:
            plists[label] = plistlib.load(handle)

host_plist = plists.get("host", {})
ext_plist = plists.get("extension", {})

check(host_plist.get("CFBundlePackageType") == "APPL", "host Info.plist CFBundlePackageType must be APPL")
check(ext_plist.get("CFBundlePackageType") == "XPC!", "extension Info.plist CFBundlePackageType must be XPC!")
check(
    host_plist.get("CFBundleIdentifier") == "$(PRODUCT_BUNDLE_IDENTIFIER)",
    "host Info.plist must use $(PRODUCT_BUNDLE_IDENTIFIER)",
)
check(
    ext_plist.get("CFBundleIdentifier") == "$(PRODUCT_BUNDLE_IDENTIFIER)",
    "extension Info.plist must use $(PRODUCT_BUNDLE_IDENTIFIER)",
)
check(
    host_plist.get("CFBundleExecutable") == "$(EXECUTABLE_NAME)",
    "host Info.plist must use $(EXECUTABLE_NAME)",
)
check(
    host_plist.get("CFBundleIconName") == "AppIcon",
    "host Info.plist must point at the AppIcon asset catalog entry",
)

icon_set = os.path.join(ROOT, "FlowzzPlus", "Assets.xcassets", "AppIcon.appiconset")
if check(os.path.isdir(icon_set), "host app icon asset catalog is missing"):
    with open(os.path.join(icon_set, "Contents.json"), encoding="utf-8") as handle:
        icon_contents = json.load(handle)
    for image in icon_contents.get("images", []):
        filename = image.get("filename")
        check(
            bool(filename) and os.path.exists(os.path.join(icon_set, filename)),
            f"app icon image referenced by the asset catalog is missing: {filename}",
        )

extension_dict = ext_plist.get("NSExtension", {})
check(isinstance(extension_dict, dict) and bool(extension_dict), "extension Info.plist has no NSExtension dict")
if isinstance(extension_dict, dict):
    check(
        extension_dict.get("NSExtensionPointIdentifier") == "com.apple.Safari.web-extension",
        "NSExtensionPointIdentifier must be com.apple.Safari.web-extension",
    )
    principal = extension_dict.get("NSExtensionPrincipalClass", "")
    check(
        principal == "$(PRODUCT_MODULE_NAME).SafariWebExtensionHandler",
        "NSExtensionPrincipalClass must be $(PRODUCT_MODULE_NAME).SafariWebExtensionHandler",
    )
    check(
        "SafariWebExtensionHandler" in principal,
        "NSExtensionPrincipalClass does not reference SafariWebExtensionHandler",
    )

# --------------------------------------------------------------------------- #
# 6. Build settings
# --------------------------------------------------------------------------- #

if host_id and ext_id:
    host_debug = build_settings(host_id, "Debug")
    host_release = build_settings(host_id, "Release")
    ext_debug = build_settings(ext_id, "Debug")
    ext_release = build_settings(ext_id, "Release")

    for configuration, settings in (("Debug", ext_debug), ("Release", ext_release)):
        check(
            settings.get("APPLICATION_EXTENSION_API_ONLY") == "YES",
            f"extension target {configuration} must set APPLICATION_EXTENSION_API_ONLY = YES",
        )
        check(
            settings.get("SKIP_INSTALL") == "YES",
            f"extension target {configuration} must set SKIP_INSTALL = YES",
        )

    for configuration, settings in (("Debug", host_debug), ("Release", host_release)):
        check(
            settings.get("SDKROOT") == "iphoneos",
            f"host target {configuration} must build for iphoneos",
        )
        check(
            settings.get("PRODUCT_NAME") == "$(TARGET_NAME)",
            f"host target {configuration} must use $(TARGET_NAME) as product name",
        )

    host_setting = host_debug.get("PRODUCT_BUNDLE_IDENTIFIER", "")
    ext_setting = ext_debug.get("PRODUCT_BUNDLE_IDENTIFIER", "")
    check(host_setting == "$(FLOWZZ_APP_BUNDLE_ID)", "host bundle identifier must use FLOWZZ_APP_BUNDLE_ID")
    check(ext_setting == "$(FLOWZZ_EXTENSION_BUNDLE_ID)", "extension bundle identifier must use FLOWZZ_EXTENSION_BUNDLE_ID")
    host_bundle = resolved_build_setting(host_debug, "PRODUCT_BUNDLE_IDENTIFIER")
    ext_bundle = resolved_build_setting(ext_debug, "PRODUCT_BUNDLE_IDENTIFIER")
    check(bool(host_bundle), "host target has no bundle identifier")
    check(bool(ext_bundle), "extension target has no bundle identifier")
    check(
        ext_bundle.startswith(host_bundle + "."),
        f"extension bundle id {ext_bundle!r} must be prefixed with the host bundle id {host_bundle!r}",
    )
    check("+" not in host_bundle + ext_bundle, "bundle identifiers must not contain '+'")
    check(bool(ID_OK.match(host_bundle)), f"host bundle id {host_bundle!r} has invalid characters")
    check(bool(ID_OK.match(ext_bundle)), f"extension bundle id {ext_bundle!r} has invalid characters")
    check(
        host_bundle == resolved_build_setting(host_release, "PRODUCT_BUNDLE_IDENTIFIER"),
        "host bundle identifier differs between Debug and Release",
    )
    check(
        ext_bundle == resolved_build_setting(ext_release, "PRODUCT_BUNDLE_IDENTIFIER"),
        "extension bundle identifier differs between Debug and Release",
    )

    # The App Store requires identical version numbers for app and extension.
    for key in ("MARKETING_VERSION", "CURRENT_PROJECT_VERSION"):
        check(
            host_debug.get(key) == ext_debug.get(key),
            f"{key} differs between host app and extension",
        )

    host_target = float(host_debug.get("IPHONEOS_DEPLOYMENT_TARGET", "0") or 0)
    ext_target = float(ext_debug.get("IPHONEOS_DEPLOYMENT_TARGET", "0") or 0)
    check(host_target >= 16.4, "host deployment target must be iOS 16.4 or later (service workers, DecompressionStream)")
    check(ext_target >= 16.4, "extension deployment target must be iOS 16.4 or later")
    check(
        ext_target <= host_target,
        "extension deployment target must not be newer than the host app's",
    )

# --------------------------------------------------------------------------- #
# 7. Extension resources and manifest
# --------------------------------------------------------------------------- #

resources_dir = os.path.join(ROOT, "FlowzzPlus Extension", "Resources")
manifest_path = os.path.join(resources_dir, "manifest.json")
if check(os.path.exists(manifest_path), "extension has no Resources/manifest.json"):
    with open(manifest_path, encoding="utf-8") as handle:
        manifest = json.load(handle)

    check(manifest.get("manifest_version") == 3, "manifest.json must declare manifest_version 3")
    check(bool(manifest.get("name")), "manifest.json has no name")
    check(bool(manifest.get("version")), "manifest.json has no version")
    check(
        bool(re.fullmatch(r"\d+(\.\d+){0,3}", str(manifest.get("version", "")))),
        "manifest.json version must be 1-4 dot separated integers",
    )

    referenced = []
    for size, path in manifest.get("icons", {}).items():
        referenced.append(path)
        check(bool(re.fullmatch(r"\d+", str(size))), f"manifest icon size {size!r} is not a number")
    action = manifest.get("action", {})
    referenced.extend(action.get("default_icon", {}).values())
    if action.get("default_popup"):
        referenced.append(action["default_popup"])
    for script in manifest.get("content_scripts", []):
        referenced.extend(script.get("js", []))
        referenced.extend(script.get("css", []))
    for path in referenced:
        check(
            os.path.exists(os.path.join(resources_dir, path)),
            f"manifest.json references a missing file: {path}",
        )

    # The version lives in three places; they must agree before a release.
    content_js_path = os.path.join(resources_dir, "content.js")
    if os.path.exists(content_js_path):
        with open(content_js_path, encoding="utf-8") as handle:
            content_js = handle.read()
        version_match = re.search(r"const VERSION = '([^']+)'", content_js)
        if check(version_match is not None, "content.js has no `const VERSION = '…'` line"):
            check(
                version_match.group(1) == str(manifest.get("version", "")),
                "content.js VERSION and manifest.json version differ",
            )
            try:
                marketing = resolved_build_setting(host_debug, "MARKETING_VERSION")
            except Exception:
                marketing = None
            if marketing:
                check(
                    marketing == str(manifest.get("version", "")),
                    "MARKETING_VERSION and manifest.json version differ",
                )
else:
    manifest = {}

for required_file in ("background.js", "content.js", "content.css"):
    check(
        os.path.exists(os.path.join(resources_dir, required_file)),
        f"missing required extension resource: {required_file}",
    )

images_dir = os.path.join(resources_dir, "images")
if check(os.path.isdir(images_dir), "extension has no Resources/images directory"):
    check(bool(os.listdir(images_dir)), "Resources/images is empty")

# --------------------------------------------------------------------------- #
# 8. No custom browser engine
# --------------------------------------------------------------------------- #

for directory, _, files in os.walk(ROOT):
    if ".git" in directory:
        continue
    for name in files:
        if name.endswith((".swift", ".js", ".html", ".json")):
            with open(os.path.join(directory, name), encoding="utf-8", errors="ignore") as handle:
                content = handle.read()
            check(
                "WKWebView" not in content,
                f"{os.path.relpath(os.path.join(directory, name), ROOT)} uses WKWebView; Safari extensions must not",
            )

# --------------------------------------------------------------------------- #
# Report
# --------------------------------------------------------------------------- #

print(f"flowzz-plus-ios-app — static validation ({checks} checks)")
print(f"project: {os.path.relpath(PROJECT, ROOT)}")
print(f"targets: {host_name!r} (application) + {ext_name!r} (app extension)")
print()

if failures:
    print(f"FAILED — {len(failures)} problem(s):")
    for failure in failures:
        print(f"  - {failure}")
    sys.exit(1)

print("OK — project structure, embedding, bundle identifiers, Info.plists and manifest are consistent.")
