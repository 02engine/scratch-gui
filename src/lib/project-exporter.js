/**
 * 项目数据导出工具
 * 用于将 Scratch 项目导出为 SB3 格式的 ArrayBuffer
 */

class ProjectExporter {
    /**
     * 将 VM 中的项目导出为 SB3 格式的 ArrayBuffer
     * @param {VM} vm - Scratch VM 实例
     * @returns {Promise<ArrayBuffer>} SB3 文件的 ArrayBuffer
     */
    static async exportToSB3(vm) {
        return new Promise((resolve, reject) => {
            try {
                // 使用 VM 的 saveProjectSb3 方法导出项目
                vm.saveProjectSb3().then(arrayBuffer => {
                    resolve(arrayBuffer);
                }).catch(error => {
                    console.error('Failed to export project:', error);
                    reject(error);
                });
            } catch (error) {
                console.error('Export error:', error);
                reject(error);
            }
        });
    }

    /**
     * 获取项目的基本信息
     * @param {VM} vm - Scratch VM 实例
     * @returns {Object} 项目信息
     */
    static getProjectInfo(vm) {
        const targets = vm.runtime.targets;
        const stage = targets.find(target => target.isStage);

        return {
            name: stage && stage.name ? stage.name : 'Untitled Project',
            spriteCount: targets.filter(target => !target.isStage).length,
            blockCount: this.countBlocks(targets),
            // 可以添加更多项目信息
        };
    }

    /**
     * 计算项目中的积木数量
     * @param {Array} targets - 项目中的所有角色和舞台
     * @returns {number} 积木总数
     */
    static countBlocks(targets) {
        let blockCount = 0;
        targets.forEach(target => {
            if (target.blocks) {
                blockCount += Object.keys(target.blocks._blocks).length;
            }
        });
        return blockCount;
    }
}

export default ProjectExporter;