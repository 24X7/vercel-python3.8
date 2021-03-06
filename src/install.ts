import execa from 'execa';
import { Meta } from '@vercel/build-utils';
import buildUtils from './build-utils';
const { debug } = buildUtils;
const pipPath = 'pip3';

const makeDependencyCheckCode = (dependency: string) => `
from importlib import util
dep = '${dependency}'.replace('-', '_')
spec = util.find_spec(dep)
print(spec.origin)
`;

async function isInstalled(dependency: string, cwd: string) {
  try {
    const { stdout } = await execa(
      'python3.8',
      ['-c', makeDependencyCheckCode(dependency)],
      {
        stdio: 'pipe',
        cwd,
      }
    );
    return stdout.startsWith(cwd);
  } catch (err) {
    return false;
  }
}

const makeRequirementsCheckCode = (requirementsPath: string) => `
import distutils.text_file
import pkg_resources
from pkg_resources import DistributionNotFound, VersionConflict
dependencies = distutils.text_file.TextFile(filename='${requirementsPath}').readlines()
pkg_resources.require(dependencies)
`;

async function areRequirementsInstalled(requirementsPath: string, cwd: string) {
  try {
    await execa(
      'python3.8',
      ['-c', makeRequirementsCheckCode(requirementsPath)],
      {
        stdio: 'pipe',
        cwd,
      }
    );
    return true;
  } catch (err) {
    return false;
  }
}

async function pipInstall(workPath: string, args: string[]) {
  const target = '.';
  // See: https://github.com/pypa/pip/issues/4222#issuecomment-417646535
  //
  // Disable installing to the Python user install directory, which is
  // the default behavior on Debian systems and causes error:
  //
  // distutils.errors.DistutilsOptionError: can't combine user with
  // prefix, exec_prefix/home, or install_(plat)base
  process.env.PIP_USER = '0';
  debug(
    `Running "pip install --disable-pip-version-check --target ${target} --upgrade ${args.join(
      ' '
    )}"...`
  );
  try {
    await execa(
      pipPath,
      [
        'install',
        '--disable-pip-version-check',
        '--target',
        target,
        '--upgrade',
        ...args,
      ],
      {
        cwd: workPath,
        stdio: 'pipe',
      }
    );
  } catch (err) {
    console.log(
      `Failed to run "pip install --disable-pip-version-check --target ${target} --upgrade ${args.join(
        ' '
      )}"...`
    );
    throw err;
  }
}

interface InstallRequirementArg {
  dependency: string;
  workPath: string;
  meta: Meta;
  args?: string[];
}

export async function installRequirement({
  dependency,
  workPath,
  meta,
  args = [],
}: InstallRequirementArg) {
  if (meta.isDev && (await isInstalled(dependency, workPath))) {
    debug(
      `Skipping ${dependency} dependency installation, already installed in ${workPath}`
    );
    return;
  }
  await pipInstall(workPath, [dependency, ...args]);
}

interface InstallRequirementsFileArg {
  filePath: string;
  workPath: string;
  meta: Meta;
  args?: string[];
}

export async function installRequirementsFile({
  filePath,
  workPath,
  meta,
  args = [],
}: InstallRequirementsFileArg) {
  if (meta.isDev && (await areRequirementsInstalled(filePath, workPath))) {
    debug(`Skipping requirements file installation, already installed`);
    return;
  }
  await pipInstall(workPath, ['-r', filePath, ...args]);
}
