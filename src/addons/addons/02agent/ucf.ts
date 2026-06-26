import { jsonToJs, jsToJson, jsToJsonWithComments } from './converter';

export function scratchToUCF(blocksArray: any[], options: any = {}) {
  return jsonToJs(blocksArray, options);
}

export function ucfToScratch(ucfString: string, options: any = {}) {
  return jsToJson(ucfString, options);
}

export function ucfToScratchWithComments(ucfString: string, options: any = {}) {
  return jsToJsonWithComments(ucfString, options);
}
