#!/usr/bin/env node

/*
 * Convert module specifiers that point inside src/ from relative paths to @/.
 *
 * Usage:
 *   node scripts/convert-relative-imports.js          # dry run
 *   node scripts/convert-relative-imports.js --write  # update files
 *   node scripts/convert-relative-imports.js --check  # CI: exit 1 if changes exist
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const projectRoot = path.resolve(__dirname, '..');
const sourceRoot = path.join(projectRoot, 'src');
const write = process.argv.includes('--write');
const check = process.argv.includes('--check');
const extensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.mts', '.cts', '.mjs', '.cjs']);
const ignoredDirectories = new Set(['node_modules', 'dist', 'build', 'coverage', '.git']);

if (write && check) {
  console.error('Use either --write or --check, not both.');
  process.exit(2);
}

if (!fs.existsSync(sourceRoot)) {
  console.error(`Source directory not found: ${sourceRoot}`);
  process.exit(2);
}

function collectFiles(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...collectFiles(absolutePath));
    else if (entry.isFile() && extensions.has(path.extname(entry.name))) files.push(absolutePath);
  }
  return files;
}

function isInside(parent, child) {
  const relative = path.relative(parent, child);
  return relative !== '' && !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative);
}

function toAlias(specifier, importer) {
  if (!specifier.startsWith('./') && !specifier.startsWith('../')) return null;

  const absoluteTarget = path.resolve(path.dirname(importer), specifier);
  if (!isInside(sourceRoot, absoluteTarget)) return null;

  const fromSourceRoot = path.relative(sourceRoot, absoluteTarget).split(path.sep).join('/');
  return `@/${fromSourceRoot}`;
}

function getModuleSpecifier(node) {
  if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) {
    return ts.isStringLiteralLike(node.moduleSpecifier) ? node.moduleSpecifier : null;
  }

  if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
    const expression = node.moduleReference.expression;
    return expression && ts.isStringLiteralLike(expression) ? expression : null;
  }

  if (ts.isCallExpression(node) && node.arguments.length === 1) {
    const isRequire = ts.isIdentifier(node.expression) && node.expression.text === 'require';
    const isDynamicImport = node.expression.kind === ts.SyntaxKind.ImportKeyword;
    const argument = node.arguments[0];
    if ((isRequire || isDynamicImport) && argument && ts.isStringLiteralLike(argument)) return argument;
  }

  return null;
}

function convertFile(filePath) {
  const input = fs.readFileSync(filePath, 'utf8');
  const sourceFile = ts.createSourceFile(filePath, input, ts.ScriptTarget.Latest, true);
  const replacements = [];

  function visit(node) {
    const literal = getModuleSpecifier(node);
    if (literal) {
      const alias = toAlias(literal.text, filePath);
      if (alias && alias !== literal.text) {
        // Replace only the contents, preserving the original quote style and formatting.
        replacements.push({ start: literal.getStart(sourceFile) + 1, end: literal.getEnd() - 1, value: alias });
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  if (replacements.length === 0) return { changed: false, count: 0 };

  let output = input;
  for (const replacement of replacements.sort((a, b) => b.start - a.start)) {
    output = output.slice(0, replacement.start) + replacement.value + output.slice(replacement.end);
  }

  if (write) {
    const temporaryPath = `${filePath}.alias-tmp`;
    fs.writeFileSync(temporaryPath, output, 'utf8');
    fs.renameSync(temporaryPath, filePath);
  }

  return { changed: true, count: replacements.length };
}

let changedFiles = 0;
let changedImports = 0;

for (const filePath of collectFiles(sourceRoot)) {
  const result = convertFile(filePath);
  if (!result.changed) continue;
  changedFiles += 1;
  changedImports += result.count;
  console.log(`${write ? 'Updated' : 'Would update'} ${path.relative(projectRoot, filePath)} (${result.count})`);
}

const mode = write ? 'Updated' : 'Found';
console.log(`${mode} ${changedImports} relative import(s) in ${changedFiles} file(s).`);
if (!write && !check && changedFiles > 0) console.log('Run again with --write to apply these changes.');
if (check && changedFiles > 0) process.exitCode = 1;
