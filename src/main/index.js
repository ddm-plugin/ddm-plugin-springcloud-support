import EurekaDataSource from "./datasource/EurekaDataSource";
import messages from '../i18n';

export default (appCore) => {
    Map.prototype.computeIfAbsent = async function (key, fun) {
        if(!this.has(key)){
            this.set(key, await fun(key));
        }
        return this.get(key);
    }

    return {
        register() {
            for(let key in messages) {
                appCore.registryPluginLocal(key, messages[key]);
            }

            appCore.registerDataSource('springcloud-eureka', new EurekaDataSource(appCore));
            return {}
        }
    };

}