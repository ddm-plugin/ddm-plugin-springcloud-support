import urlUtils                   from "@/common/UrlUtils";
import dubboConfigurationUtils    from "@/common/DubboConfigurationUtils";
import path                       from "path";


const COMMON_HEADER = {
    'Accept': 'application/json'
}

class EurekaDataSource {

    constructor(appCore) {
        this.appCore = appCore;
        this.name = "Spring Cloud Eureka";
    }

    async getFormConfig() {
        return {
            properties: [{
                    label: this.appCore.t('connect.eureka.address'),
                    name: "address",
                    type: "input",
                    required: true,
                    default: "http://localhost:8080/",
                },
                {
                    label: this.appCore.t('connect.eureka.sessionTimeout'),
                    name: "sessionTimeout",
                    type: "input",
                    required: true,
                    default: "5000",
                }
            ],
        }
    }

    async getServiceList(dataSourceInfo) {
        const url = `${dataSourceInfo.address}/eureka/apps`

        const response = await this.appCore.axios.get(url, {
            headers: COMMON_HEADER
        });
        
        const applications = response.data.applications.application;
        if(!applications) {
            return [];
        }

        const serviceList = new Array();
        for (let i = 0; i < applications.length; i++) {
            const application = applications[i];

            for (let i = 0; i < application.instance.length; i++) {
                const element = application.instance[i];
                
                const swaggerUrl = urlUtils.resolve(element.homePageUrl, '/v2/api-docs');
                const response1 = await this.appCore.axios.get(swaggerUrl);
                response1.data.tags.forEach(tag => {
                    serviceList.push({
                        serviceName: `${application.name}.${tag.name}`,
                        uniqueServiceName: `${application.name}.${tag.name}`,
                    });
                })
            }
        }

        return {
            list: serviceList,
            separator: '.',
            packageSeparator: '.'
        };
    }

    async getProviderList(dataSourceInfo, serviceInfo) {
        const data = await this.getServiceData(dataSourceInfo, serviceInfo);

        const serviceDisabledMap = new Map();
        let array = new Array();
        for (let i = 0; i < data.providers.length; i++) {
            if (data.providers[i].registrySource !== 'INTERFACE') {
                continue;
            }

            let providerInfo = this.parseProvderInfo(data.providers[i]);

            // 服务是否被禁用
            const disabledAddresses = await serviceDisabledMap.computeIfAbsent(providerInfo.uniqueServiceName, async () => dubboConfigurationUtils.getDisableAddresses(await this.getJsonConfiguration(dataSourceInfo, serviceInfo, providerInfo)))
            providerInfo.disabled = disabledAddresses.find(item => item === '0.0.0.0' || item === providerInfo.address) != null;

            const methodList = [];
            if (data.metadata) {
                data.metadata.methods.forEach(method => {
                    methodList.push({
                        ...method,
                        defaultParameter: JSON.stringify(this.appCore.getParamGenerator().generateParam(data.metadata, method.name), null, 2) || "[]",
                    });
                })
            } else {
                providerInfo.methods.forEach(method => {
                    methodList.push({
                        name: method,
                        parameterTypes: null,
                        defaultParameter: "[]",
                        returnType: null
                    });
                });
            }
            providerInfo.methods = methodList;

            array.push(providerInfo)
        }

        return array;
    }



    async getConsumerList(dataSourceInfo, serviceInfo) {
        const data = await this.getServiceData(dataSourceInfo, serviceInfo);

        let array = new Array();
        for (let i = 0; i < data.consumers.length; i++) {
            array.push(this.parseConsumerInfo(data.consumers[i]))
        }

        return array;
    }

    async getServiceData(dataSourceInfo, serviceInfo) {
        // `http://127.0.0.1:8848/api/dev/service/${org.apache.dubbo.demo.DemoService}`
        const url = `${dataSourceInfo.address}/service/${serviceInfo.uniqueServiceName}`
        const response = await this.appCore.axios.get(url, {
            headers: {
                'Authorization': await this.getToken(dataSourceInfo)
            }
        });
        return response.data;
    }



    // eslint-disable-next-line no-unused-vars
    async getConfiguration(dataSourceInfo, serviceInfo, providerInfo) {
        const url = `${dataSourceInfo.address}/rules/override/${serviceInfo.uniqueServiceName}:/`;

        try {
            const response = await this.appCore.axios.get(url, {
                headers: {
                    'Authorization': await this.getToken(dataSourceInfo)
                }
            });
            const config = response.data;
            return config ? config : yamlUtils.JSONToYaml(dubboConfigurationUtils.createDubboDefaultConfiguration());
        } catch (error) {
            if (error.response.status == 404) {
                return yamlUtils.JSONToYaml(dubboConfigurationUtils.createDubboDefaultConfiguration());
            }

            throw error;
        }
    }

    async getJsonConfiguration(dataSourceInfo, serviceInfo, providerInfo) {
        return yamlUtils.yamlToJSON(await this.getConfiguration(dataSourceInfo, serviceInfo, providerInfo));
    }

    // eslint-disable-next-line no-unused-vars
    async saveConfiguration(dataSourceInfo, serviceInfo, providerInfo, doc) {
        const url = `${dataSourceInfo.address}/rules/override/${serviceInfo.uniqueServiceName}:`;

        try {
            // 有配置项，保存，反之删除
            if (doc && doc.configs && doc.configs.length > 0) {
                await this.appCore.axios.put(url, doc, {
                    headers: {
                        'Authorization': await getToken(dataSourceInfo)
                    }
                });
            } else {
                await this.appCore.axios.delete(url, {
                    'Authorization': await getToken(dataSourceInfo)
                });
            }

        } catch (error) {
            if (error.response.status !== 404) {
                throw error;
            }
        }
    }

    async invokeMethod(dataSourceInfo, serviceInfo, provder, methodInfo, code, invokerType) {

        const startTime = new Date().getTime();
        const data = {
            service: serviceInfo.uniqueServiceName,
            method: methodInfo.name,
            parameterTypes: this.getMethodParameterTypes(methodInfo),
            params: JSON.parse(code)
        }

        // `http://127.0.0.1:8848/api/dev/test`
        const url = `${dataSourceInfo.address}/test`

        let response = await this.appCore.axios.post(url, data, {
            headers: {
                'Accept': 'application/json, text/plain, */*',
                'Content-Type': 'application/json;charset=UTF-8',
                'Authorization': await this.getToken(dataSourceInfo)
            }
        });

        return {
            data: this.appCore.jsonFormat.format(JSON.stringify(response.data)),
            elapsedTime: new Date().getTime() - startTime
        };
    }

    async getToken(dataSourceInfo) {
        let params = {
            userName: dataSourceInfo.username,
            password: dataSourceInfo.password,
        }

        // `http://127.0.0.1:8848/api/dev/user/login`
        const url = `${dataSourceInfo.address}/user/login`;
        let response = await this.appCore.axios.get(url, { params  });
        return response.data;
    }
    
    parseProvderInfo(data) {
        let urlData = urlUtils.parseURL(`dubbo://${data.address}/?${data.parameters}`);
        return {
            application: data.application,
            ip: urlData.host,
            port: urlData.port,
            address: `${urlData.host}:${urlData.port}`,
            serviceName: data.service,
            uniqueServiceName: data.service,
            version: urlData.params.version,
            group: "",
            providerVersion: urlData.params.revision,
            dubboVersion: urlData.params.release,

            methods: urlData.params.methods.split(","),
            protocol: urlData.protocol,
            generic: urlData.params.generic,
            deprecated: urlData.params.deprecated,
            weight: data.weight,
        };
    }


    parseConsumerInfo(data) {
        let urlData = urlUtils.parseURL(`${data.url}?${data.parameters}`);
        let methods = urlData.params.methods || "";
        return {
            application: data.application,
            ip: data.address,
            serviceName: urlData.params.interface,
            version: urlData.params.version,
            disabled: !urlData.params["qos.enable"],
            
            timeout: urlData.params.timeout,
            retries: urlData.params.retries || 2,

            providerVersion: urlData.params.revision,
            dubboVersion: urlData.params.release,

            check: urlData.params.check,
            methods: methods.split(","),
            dubbo: urlData.params.dubbo,
            lazy: urlData.params.lazy,
            pid: urlData.params.pid,
            sticky: urlData.params.sticky,
            category: urlData.params.category,
            timestamp: urlData.params.timestamp,
        };
    }





    getMethodParameterTypes(methodInfo) {
        return methodInfo.parameterTypes.map(paramterType => {
            if (paramterType.indexOf("<") >= 0) {
                return paramterType.substring(0, paramterType.indexOf("<"));
            }
            return paramterType;
        });
    }
}


export default EurekaDataSource;