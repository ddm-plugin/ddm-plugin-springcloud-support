import lodash from 'lodash';


class SwaggerUtils {



    getControllerList(data) {
        
        
        const keys = data.tags.map(x => x.name);
        
        
        const array = [];
        for(key in data.paths) {
            const mappings = data.paths[key];

            for(mapping in mappings) {
                const mapping = mappings[m];

                const controllerName = mapping.tags[0];

                const path = mapping.path;
                const method = mapping.method;
                
            }    




        }
        

        data.tags.forEach(tag => {
            
        })



    }


}

